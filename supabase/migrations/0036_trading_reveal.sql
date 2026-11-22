-- =============================================================================
-- 0036_trading_reveal.sql — the paper trading game's end-of-game reveal.
--
-- Why: when the game finishes, each student sees what really happened: the
-- real era, the real companies behind the fake names, their own trades placed
-- on the real calendar beside that period's real headlines, their result
-- against buying and holding the index fund, and where they sit in the class
-- on turnover against return (Barber & Odean's question). get_trading_truth
-- (0033) already names the era and the companies; this adds the per-trade
-- dates, each period's real dates and headlines, every company's price change
-- and the class's turnover and return, in one read.
--
-- Rules:
--   1. Finished sessions only, host and students alike. (The host can already
--      see the era mid-game through get_trading_truth; nothing here is needed
--      before the end.)
--   2. A student gets their own fills only. The class list is anonymous for
--      students (no names, no player ids; their own row is marked is_me); the
--      host gets names and ids.
--   3. Dates come from game days: real date = Jan 1 of the start year + game
--      day (0033's game-day convention).
--   4. Turnover is half the dollars traded over the average starting value of
--      the account's rounds, per year of market time. MIRRORS annualTurnover in
--      lib/markets/trading/stats.ts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Annual turnover of one account. MIRRORS annualTurnover (stats.ts): rounds =
-- rows of market_account_rounds; the average is over the rounds' starting
-- values above zero; 0 when there is nothing to average.
-- ---------------------------------------------------------------------------
create or replace function public._trading_turnover(p_player_id uuid, p_periods_per_year numeric)
returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select case
           when count(*) = 0 or coalesce(avg(r.nlv_start) filter (where r.nlv_start > 0), 0) <= 0 then 0
           else round(sum(r.traded) / 2
                      / avg(r.nlv_start) filter (where r.nlv_start > 0)
                      / (count(*) / p_periods_per_year), 6)
         end
    from public.market_account_rounds r
   where r.player_id = p_player_id;
$$;

-- ---------------------------------------------------------------------------
-- get_trading_reveal — everything the finished screens show, in one read.
-- ---------------------------------------------------------------------------
create or replace function public.get_trading_reveal(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_cfg    jsonb;
  v_ms     public.market_session_secrets%rowtype;
  v_host   boolean;
  v_me     uuid;
  v_jan1   int;
  v_ppy    numeric;
  v_start  numeric;
  v_last   int;
begin
  select s.status, s.config into v_status, v_cfg from public.sessions s where s.id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  if v_status <> 'finished' then
    raise exception 'the reveal opens when the game ends';
  end if;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'not a paper trading session'; end if;

  v_host  := public.is_session_host(p_session_id);
  select p.id into v_me from public.players p
   where p.session_id = p_session_id and p.auth_uid = auth.uid() limit 1;
  v_jan1  := public._mkt_day(make_date(v_ms.start_year, 1, 1));
  v_ppy   := case v_cfg->>'period' when 'year' then 1 when 'half' then 2 when 'quarter' then 4
                                   when 'month' then 12 else 52 end;
  v_start := coalesce((v_cfg->>'starting_wealth')::numeric, 100000);
  select max(r.last_game_day) into v_last
    from public.market_period_results r
   where r.session_id = p_session_id and r.last_game_day is not null;

  return jsonb_build_object(
    'start_year', v_ms.start_year,
    'window_first_date', public._mkt_date(v_ms.window_first_day),
    'window_last_date', public._mkt_date(v_ms.window_last_day),
    -- the game may finish before its window runs out
    'played_last_date', case when v_last is null then null else public._mkt_date(v_jan1 + v_last) end,
    'starting_cash', v_start,
    -- buying the index fund on day one and holding it: the periods' returns compounded
    'index_return', (select round(exp(sum(ln(greatest(1 + r.index_return, 1e-9)))) - 1, 6)
                       from public.market_period_results r
                      where r.session_id = p_session_id and r.index_return is not null),
    'periods', (select coalesce(jsonb_agg(jsonb_build_object(
                   'round', r.round_number,
                   'first_date', public._mkt_date(v_jan1 + r.first_game_day),
                   'last_date', public._mkt_date(v_jan1 + r.last_game_day),
                   'index_return', r.index_return,
                   'headlines', (select coalesce(jsonb_agg(jsonb_build_object('month', h.month, 'text', h.text)
                                                           order by h.month, h.rank), '[]'::jsonb)
                                   from public.market_headlines h
                                  where h.rank <= 2
                                    and h.month between to_char(public._mkt_date(v_jan1 + r.first_game_day), 'YYYY-MM')
                                                    and to_char(public._mkt_date(v_jan1 + r.last_game_day), 'YYYY-MM'))
                 ) order by r.round_number), '[]'::jsonb)
                  from public.market_period_results r
                 where r.session_id = p_session_id and r.first_game_day is not null),
    -- the fake name beside the real one; price change from the last close before
    -- Year 1 to the last played day (prices only, no dividends; null if it stopped trading)
    'instruments', (select coalesce(jsonb_agg(jsonb_build_object(
                       'slot', si.slot, 'kind', si.kind, 'sector', si.sector,
                       'name', si.name, 'ticker', si.ticker,
                       'real_name', coalesce(u.real_name, i.real_name),
                       'real_ticker', coalesce(u.real_ticker, i.real_ticker),
                       'current_name', i.real_name,
                       'price_change', case when p0.price > 0 and p1.price is not null
                                            then round(p1.price / p0.price - 1, 6) end
                     ) order by si.slot), '[]'::jsonb)
                      from public.session_instruments si
                      join public.session_instrument_secrets s on s.session_id = si.session_id and s.slot = si.slot
                      join public.market_instruments i on i.id = s.instrument_id
                      left join lateral (
                        select u2.real_name, u2.real_ticker from public.market_universe u2
                         where u2.instrument_id = i.id and u2.anchor_year <= v_ms.start_year
                         order by u2.anchor_year desc limit 1) u on true
                      left join public._trading_last_prices(p_session_id, v_jan1 - 1) p0 on p0.slot = si.slot
                      left join public._trading_last_prices(p_session_id, v_jan1 + coalesce(v_last, -1)) p1
                             on p1.slot = si.slot
                     where si.session_id = p_session_id),
    -- the caller's own fills on the real calendar (none for the host)
    'my_fills', (select coalesce(jsonb_agg(jsonb_build_object(
                    'round', f.round_number, 'date', public._mkt_date(v_jan1 + f.game_day),
                    'slot', f.slot, 'side', f.side, 'quantity', f.quantity, 'price', f.price,
                    'notional', f.notional, 'reason', f.reason
                  ) order by f.game_day, f.created_at), '[]'::jsonb)
                   from public.market_fills f
                  where v_me is not null and f.player_id = v_me),
    -- the class on turnover against return: anonymous to students
    'class', (select coalesce(jsonb_agg(jsonb_build_object(
                 'player_id', case when v_host then p.id end,
                 'name', case when v_host or p.id = v_me then p.display_name end,
                 'is_me', p.id is not distinct from v_me,
                 'nlv', a.nlv,
                 'return', round(a.nlv / v_start - 1, 6),
                 'turnover', public._trading_turnover(p.id, v_ppy),
                 'sharpe', a.sharpe,
                 'max_drawdown', a.max_drawdown,
                 'trades', (select count(*) from public.market_fills f
                             where f.player_id = p.id and f.reason = 'order')
               ) order by a.nlv desc, p.id), '[]'::jsonb)
                from public.players p
                join public.market_accounts a on a.player_id = p.id
               where p.session_id = p_session_id and p.is_active and not p.is_bot)
  );
end;
$$;

revoke all on function public._trading_turnover(uuid, numeric) from public, anon, authenticated;
revoke all on function public.get_trading_reveal(uuid)         from public, anon;
grant execute on function public.get_trading_reveal(uuid) to authenticated;
