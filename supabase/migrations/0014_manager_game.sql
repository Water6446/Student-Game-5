-- =============================================================================
-- 0014_manager_game.sql — Module 3: "The Manager Game" (active vs. passive).
--
-- A third game type on the same engine. Each round is one YEAR. Students split
-- wealth across a risk-free asset and N portfolio managers, and may lever up to
-- leverage_cap x. Returns are CONTINUOUS normals, not good/bad draws:
--
--   r_market ~ N(market_mean, market_sd)
--   r_i      = beta_i * r_market + alpha_i + N(0, tracking_error_i)
--
-- Nothing in the good/bad path applies, so resolve_round gets a third top-level
-- branch (see 0015_manager_resolve.sql) rather than a generalisation of the
-- existing two.
--
-- THE SECRECY PROBLEM. sessions.config is readable by any session member
-- (0002_rls.sql). That is fine for good_prob but fatal for alpha: the entire
-- lesson is that skill is nearly invisible in the data. So the true parameters
-- live in session_secrets, a table with RLS ON and NO POLICIES AND NO GRANTS —
-- deny-all for every role including the host. Only SECURITY DEFINER functions
-- can read it. sessions.config carries public data only: names, fee terms,
-- track records, a volatility LABEL.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

-- rounds: the year's draws, written ONLY at reveal time (same rule as
-- market_outcome — nothing about the future is ever stored in advance).
alter table public.rounds add column if not exists market_return   numeric;
alter table public.rounds add column if not exists manager_returns jsonb;

comment on column public.rounds.manager_returns is
  'Manager game: [r0..rn-1] GROSS returns for the year, written at reveal.';

-- allocations: fees are the one thing not derivable from the other columns.
alter table public.allocations add column if not exists fees_paid     numeric;
alter table public.allocations add column if not exists fee_breakdown jsonb;

comment on column public.allocations.fee_breakdown is
  'Manager game: [{mgmt, perf}, ...] dollars per manager for the year.';

-- Reused, deliberately, so every existing host surface keeps working unchanged:
--   risky_breakdown -> per-manager DOLLAR amounts
--   risky_amount    -> their sum, A
--   safe_amount     -> W - A, which is NEGATIVE when the player is levered.
-- Keeping the invariant risky_amount + safe_amount = W is what lets
-- AllocationsBreakdown, playerDeltaChipsMap, SessionHistoryTable, WealthChart
-- and bustRoundByPlayer work with no changes. Borrowed is max(0, -safe_amount),
-- derived rather than stored.

-- 'index' is the lone synthetic competitor in a manager game: it compounds the
-- market return with no fees and no leverage.
alter table public.players drop constraint if exists players_strategy_chk;
alter table public.players add constraint players_strategy_chk
  check (strategy is null or strategy in
    ('all_safe','edge','fifty_fifty','all_risky',
     'concentrated','diversified','half_diversified',
     'index'));

-- ---------------------------------------------------------------------------
-- session_secrets — the true manager parameters. RLS on, no policies, no
-- grants: unreachable by anon and authenticated alike, host included.
-- ---------------------------------------------------------------------------
create table if not exists public.session_secrets (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  secret     jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.session_secrets enable row level security;
-- Deliberately NO policies: RLS-on + zero policies = deny all, for every role.
-- The only readers are the SECURITY DEFINER functions below.
revoke all on public.session_secrets from anon, authenticated;

comment on table public.session_secrets is
  'Manager game truth: per-manager beta/alpha/tracking_error plus the skill '
  'shuffle. Deny-all by design — read only through get_manager_truth().';

-- ---------------------------------------------------------------------------
-- _rand_normal — Box-Muller. random() is uniform and core Postgres has no
-- normal; tablefunc is not guaranteed enabled. Internal helper: granted to
-- nobody, called by SECURITY DEFINER functions as the owner.
-- ---------------------------------------------------------------------------
create or replace function public._rand_normal(p_mean numeric, p_sd numeric)
returns numeric
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  u1 double precision;
  u2 double precision;
begin
  -- guard u1 > 0: ln(0) is -infinity
  u1 := greatest(random(), 1e-12);
  u2 := random();
  return p_mean + p_sd * (sqrt(-2 * ln(u1)) * cos(2 * pi() * u2))::numeric;
end;
$$;

revoke all on function public._rand_normal(numeric, numeric) from public;

-- ---------------------------------------------------------------------------
-- get_manager_truth — the only way to read session_secrets.
--
-- The host may call it at any time: they authored the session and are not a
-- competitor. Students only once the game is finished — before that it would
-- hand them the answer the whole module is about not being able to see.
-- ---------------------------------------------------------------------------
create or replace function public.get_manager_truth(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_secret jsonb;
begin
  select status into v_status from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;

  if not public.is_session_host(p_session_id) then
    if not public.is_session_member(p_session_id) then
      raise exception 'not a member of this session';
    end if;
    if v_status <> 'finished' then
      raise exception 'manager details are revealed when the game finishes';
    end if;
  end if;

  select secret into v_secret from public.session_secrets
    where session_id = p_session_id;
  if not found then
    raise exception 'this session has no manager details';
  end if;
  return v_secret;
end;
$$;

revoke all on function public.get_manager_truth(uuid) from public;
grant execute on function public.get_manager_truth(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- _manager_preset — the shipped manager line-ups, FULL definitions (public and
-- private keys together). create_session splits them; nothing else reads this.
--
-- Slots 0 and 1 of the default preset are parameter-identical apart from the
-- SIGN OF ALPHA. That is what makes them unidentifiable year to year, which is
-- the entire point of the module. Do not "improve" one of them.
-- ---------------------------------------------------------------------------
create or replace function public._manager_preset(p_key text)
returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select case p_key
    when 'hedge_fund' then jsonb_build_array(
      jsonb_build_object('name','Meridian Alpha','strategy_line','Concentrated bottom-up equity research.','beta',1.0,'alpha',0.02,'tracking_error',0.05,'fee_type','performance','mgmt_fee',0.02,'perf_fee',0.20),
      jsonb_build_object('name','Apex Capital','strategy_line','High-conviction global opportunities.','beta',1.0,'alpha',-0.02,'tracking_error',0.05,'fee_type','performance','mgmt_fee',0.02,'perf_fee',0.20),
      jsonb_build_object('name','Momentum Partners','strategy_line','Systematic trend and momentum signals.','beta',1.0,'alpha',0.0,'tracking_error',0.08,'fee_type','performance','mgmt_fee',0.02,'perf_fee',0.20),
      jsonb_build_object('name','Steady Harbor','strategy_line','Large-cap core, benchmark aware.','beta',1.0,'alpha',0.0,'tracking_error',0.03,'fee_type','performance','mgmt_fee',0.02,'perf_fee',0.20),
      jsonb_build_object('name','Titan Leveraged Growth','strategy_line','Amplified exposure to secular growth.','beta',1.5,'alpha',0.0,'tracking_error',0.10,'fee_type','performance','mgmt_fee',0.02,'perf_fee',0.20)
    )
    when 'market_neutral' then jsonb_build_array(
      jsonb_build_object('name','Parity Absolute Return','strategy_line','Market-neutral long/short; returns uncorrelated with the index.','beta',0.1,'alpha',0.03,'tracking_error',0.06,'fee_type','performance','mgmt_fee',0.02,'perf_fee',0.20),
      jsonb_build_object('name','Meridian Alpha','strategy_line','Concentrated bottom-up equity research.','beta',1.0,'alpha',0.02,'tracking_error',0.05,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Apex Capital','strategy_line','High-conviction global opportunities.','beta',1.0,'alpha',-0.02,'tracking_error',0.05,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Momentum Partners','strategy_line','Systematic trend and momentum signals.','beta',1.0,'alpha',0.0,'tracking_error',0.08,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Steady Harbor','strategy_line','Large-cap core, benchmark aware.','beta',1.0,'alpha',0.0,'tracking_error',0.03,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Titan Leveraged Growth','strategy_line','Amplified exposure to secular growth.','beta',1.5,'alpha',0.0,'tracking_error',0.10,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0)
    )
    else jsonb_build_array(
      jsonb_build_object('name','Meridian Alpha','strategy_line','Concentrated bottom-up equity research.','beta',1.0,'alpha',0.02,'tracking_error',0.05,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Apex Capital','strategy_line','High-conviction global opportunities.','beta',1.0,'alpha',-0.02,'tracking_error',0.05,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Momentum Partners','strategy_line','Systematic trend and momentum signals.','beta',1.0,'alpha',0.0,'tracking_error',0.08,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Steady Harbor','strategy_line','Large-cap core, benchmark aware.','beta',1.0,'alpha',0.0,'tracking_error',0.03,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0),
      jsonb_build_object('name','Titan Leveraged Growth','strategy_line','Amplified exposure to secular growth.','beta',1.5,'alpha',0.0,'tracking_error',0.10,'fee_type','flat','mgmt_fee',0.01,'perf_fee',0.0)
    )
  end;
$$;

revoke all on function public._manager_preset(text) from public;

-- ---------------------------------------------------------------------------
-- _gen_track_record — the prospectus numbers for ONE manager.
--
-- THE COMMON WAY TO GET THIS WRONG is drawing the 1/5/10-year figures
-- independently. Don't. Generate exactly one 10-year path, then read all three
-- figures off that one path, so the headline numbers and the yearly column can
-- never contradict each other.
--
-- The 10-year history is drawn against its OWN market path — it happened before
-- the game started and must not reuse the live game's draws.
--
-- Yearly figures are NET of fees, the way a real prospectus reports them. The
-- volatility LABEL is computed from the realised displayed path rather than
-- from beta/tracking_error, so it cannot be inverted back into the truth.
-- ---------------------------------------------------------------------------
create or replace function public._gen_track_record(
  p_beta numeric, p_alpha numeric, p_te numeric,
  p_mgmt_fee numeric, p_perf_fee numeric,
  p_market_mean numeric, p_market_sd numeric
) returns jsonb
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_yearly  numeric[] := array[]::numeric[];
  v_rm      numeric;
  v_gross   numeric;
  v_net     numeric;
  v_cum10   numeric := 1;
  v_cum5    numeric := 1;
  v_mean    numeric := 0;
  v_var     numeric := 0;
  v_sd      numeric;
  v_label   text;
  y         int;
begin
  for y in 1..10 loop
    v_rm    := public._rand_normal(p_market_mean, p_market_sd);
    v_gross := p_beta * v_rm + p_alpha + public._rand_normal(0, p_te);
    -- performance fee on the GROSS return, per MECHANICS.md § Manager game
    v_net   := v_gross - p_mgmt_fee - p_perf_fee * greatest(v_gross, 0);
    v_yearly := v_yearly || round(v_net, 4);
  end loop;

  -- Compounding floors each factor just above zero: a sub -100% year is a
  -- ~6-sigma draw, but power() on a negative base with a fractional exponent
  -- errors, and a prospectus that crashes is worse than one that clips.
  for y in 1..10 loop
    v_cum10 := v_cum10 * greatest(1 + v_yearly[y], 0.0001);
    if y >= 6 then
      v_cum5 := v_cum5 * greatest(1 + v_yearly[y], 0.0001);
    end if;
    v_mean := v_mean + v_yearly[y];
  end loop;
  v_mean := v_mean / 10;

  for y in 1..10 loop
    v_var := v_var + (v_yearly[y] - v_mean) ^ 2;
  end loop;
  v_sd := sqrt(v_var / 10);

  v_label := case
    when v_sd < 0.10 then 'Low'
    when v_sd < 0.20 then 'Moderate'
    when v_sd < 0.30 then 'High'
    else 'Very high'
  end;

  return jsonb_build_object(
    'yearly',   to_jsonb(v_yearly),
    'one_yr',   v_yearly[10],
    'five_yr',  round(power(v_cum5,  0.2) - 1, 4),
    'ten_yr',   round(power(v_cum10, 0.1) - 1, 4),
    'vol_label', v_label
  );
end;
$$;

revoke all on function public._gen_track_record(numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;

-- ---------------------------------------------------------------------------
-- create_session — 0012's body plus the manager branch. This is where the
-- manager parameters arrive, where the skill shuffle happens, where the track
-- records are generated and where session_secrets is written: one transaction,
-- because all four have to be mutually consistent.
-- ---------------------------------------------------------------------------
create or replace function public.create_session(p_config jsonb default '{}'::jsonb)
returns table (id uuid, join_code text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_defaults jsonb;
  v_config   jsonb;
  v_code     text;
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- no 0/O/1/I/L ambiguity
  v_id       uuid;
  v_assets   jsonb;
  v_asset    jsonb;
  v_n        int;
  i          int;
  -- manager game
  v_mgrs      jsonb;
  v_mgr       jsonb;
  v_alphas    numeric[];
  v_perm      int[];
  v_pub       jsonb := '[]'::jsonb;
  v_priv      jsonb := '[]'::jsonb;
  v_track     jsonb;
  v_secret    jsonb;
  v_swap      int;
  j           int;
begin
  if v_uid is null then
    raise exception 'must be signed in to create a session';
  end if;

  v_defaults := jsonb_build_object(
    'game_type', 'basic',
    'payoff_mode', 'moderate', 'num_rounds', 25, 'starting_wealth', 100,
    'good_prob', 0.6, 'market_mode', 'auto', 'market_scope', 'shared',
    'show_full_leaderboard_to_students', true, 'allow_late_join', false
  );
  v_config := v_defaults || coalesce(p_config, '{}'::jsonb);

  -- shared validation
  if (v_config->>'game_type') not in ('basic','portfolio','manager') then
    raise exception 'invalid game_type'; end if;
  if (v_config->>'payoff_mode') not in ('moderate','extreme') then
    raise exception 'invalid payoff_mode'; end if;
  if (v_config->>'market_mode') not in ('auto','manual') then
    raise exception 'invalid market_mode'; end if;
  if (v_config->>'market_scope') not in ('shared','independent') then
    raise exception 'invalid market_scope'; end if;
  if (v_config->>'num_rounds')::numeric not between 1 and 200 then
    raise exception 'num_rounds must be 1..200'; end if;
  if (v_config->>'starting_wealth')::numeric <= 0 then
    raise exception 'starting_wealth must be > 0'; end if;
  if (v_config->>'good_prob')::numeric not between 0 and 1 then
    raise exception 'good_prob must be in [0,1]'; end if;
  -- manual market implies shared outcomes per round
  if (v_config->>'market_mode') = 'manual' then
    v_config := jsonb_set(v_config, '{market_scope}', '"shared"');
  end if;

  -- portfolio-only validation
  if (v_config->>'game_type') = 'portfolio' then
    v_n := coalesce((v_config->>'num_assets')::int, 4);
    if v_n not between 2 and 10 then
      raise exception 'num_assets must be 2..10'; end if;
    v_config := jsonb_set(v_config, '{num_assets}', to_jsonb(v_n));
    if coalesce((v_config->>'risk_free_rate')::numeric, 0) not between 0 and 0.5 then
      raise exception 'risk_free_rate must be in [0, 0.5]'; end if;
    -- ρ: how much the assets move together (0 = independent, 1 = one market)
    if coalesce((v_config->>'correlation')::numeric, 0) not between 0 and 1 then
      raise exception 'correlation must be in [0, 1]'; end if;

    v_assets := v_config->'assets';
    if v_assets is not null and jsonb_typeof(v_assets) <> 'null' then
      if jsonb_typeof(v_assets) <> 'array' or jsonb_array_length(v_assets) <> v_n then
        raise exception 'assets must be an array of length num_assets'; end if;
      for i in 0..(v_n - 1) loop
        v_asset := v_assets->i;
        if v_asset ? 'good_prob'
           and (v_asset->>'good_prob')::numeric not between 0 and 1 then
          raise exception 'asset % good_prob must be in [0,1]', i + 1; end if;
        if v_asset ? 'payoff_mode'
           and (v_asset->>'payoff_mode') not in ('moderate','extreme') then
          raise exception 'asset % payoff_mode invalid', i + 1; end if;
      end loop;
    end if;
  end if;

  -- manager-only validation, shuffle, track records and the public/private split
  if (v_config->>'game_type') = 'manager' then
    -- One index path and one set of manager returns for the whole class each
    -- year: independent scope would make the ghost line meaningless and the
    -- leaderboard unfair. Manual mode has no v1 path (see the plan's backlog).
    if (v_config->>'market_mode') = 'manual' then
      raise exception 'manual market mode is not supported for manager games';
    end if;
    v_config := jsonb_set(v_config, '{market_scope}', '"shared"');

    v_config := jsonb_set(v_config, '{market_mean}',
      to_jsonb(coalesce((v_config->>'market_mean')::numeric, 0.08)));
    v_config := jsonb_set(v_config, '{market_sd}',
      to_jsonb(coalesce((v_config->>'market_sd')::numeric, 0.16)));
    v_config := jsonb_set(v_config, '{risk_free_rate}',
      to_jsonb(coalesce((v_config->>'risk_free_rate')::numeric, 0.03)));
    v_config := jsonb_set(v_config, '{borrow_spread}',
      to_jsonb(coalesce((v_config->>'borrow_spread')::numeric, 0.05)));
    v_config := jsonb_set(v_config, '{leverage_cap}',
      to_jsonb(coalesce((v_config->>'leverage_cap')::numeric, 2.0)));
    v_config := jsonb_set(v_config, '{shuffle_skill}',
      to_jsonb(coalesce((v_config->>'shuffle_skill')::boolean, true)));

    if (v_config->>'market_mean')::numeric not between -0.5 and 0.5 then
      raise exception 'market_mean must be in [-0.5, 0.5]'; end if;
    if (v_config->>'market_sd')::numeric not between 0 and 1 then
      raise exception 'market_sd must be in [0, 1]'; end if;
    if (v_config->>'risk_free_rate')::numeric not between 0 and 0.5 then
      raise exception 'risk_free_rate must be in [0, 0.5]'; end if;
    if (v_config->>'borrow_spread')::numeric not between 0 and 0.5 then
      raise exception 'borrow_spread must be in [0, 0.5]'; end if;
    if (v_config->>'leverage_cap')::numeric not between 1.0 and 3.0 then
      raise exception 'leverage_cap must be in [1.0, 3.0]'; end if;

    -- Managers come from the host's advanced panel, or from a shipped preset.
    v_mgrs := v_config->'managers';
    if v_mgrs is null or jsonb_typeof(v_mgrs) <> 'array'
       or jsonb_array_length(v_mgrs) = 0 then
      v_mgrs := public._manager_preset(coalesce(v_config->>'manager_preset', 'default'));
    end if;
    v_n := jsonb_array_length(v_mgrs);
    if v_n not between 1 and 8 then
      raise exception 'num_managers must be 1..8'; end if;

    for i in 0..(v_n - 1) loop
      v_mgr := v_mgrs->i;
      if coalesce((v_mgr->>'beta')::numeric, 1) not between -2 and 3 then
        raise exception 'manager % beta must be in [-2, 3]', i + 1; end if;
      if coalesce((v_mgr->>'alpha')::numeric, 0) not between -0.5 and 0.5 then
        raise exception 'manager % alpha must be in [-0.5, 0.5]', i + 1; end if;
      if coalesce((v_mgr->>'tracking_error')::numeric, 0) not between 0 and 1 then
        raise exception 'manager % tracking_error must be in [0, 1]', i + 1; end if;
      if coalesce((v_mgr->>'mgmt_fee')::numeric, 0) not between 0 and 0.1 then
        raise exception 'manager % mgmt_fee must be in [0, 0.1]', i + 1; end if;
      if coalesce((v_mgr->>'perf_fee')::numeric, 0) not between 0 and 0.5 then
        raise exception 'manager % perf_fee must be in [0, 0.5]', i + 1; end if;
      if coalesce(v_mgr->>'fee_type', 'flat') not in ('flat','performance') then
        raise exception 'manager % fee_type invalid', i + 1; end if;
    end loop;

    -- THE SHUFFLE: permute the ALPHA VECTOR ONLY. Names, one-liners, betas,
    -- tracking errors and fees stay pinned to their slot, so the personalities
    -- survive and only *who is actually skilled* moves. Genuine skill can end
    -- up behind "Steady Harbor", which is a delightful outcome.
    v_perm := array[]::int[];
    v_alphas := array[]::numeric[];
    for i in 0..(v_n - 1) loop
      v_perm := v_perm || i;
      v_alphas := v_alphas || coalesce((v_mgrs->i->>'alpha')::numeric, 0);
    end loop;
    if (v_config->>'shuffle_skill')::boolean then
      for i in reverse v_n..2 loop           -- Fisher-Yates over 1-based indices
        j := 1 + floor(random() * i)::int;
        v_swap := v_perm[i]; v_perm[i] := v_perm[j]; v_perm[j] := v_swap;
      end loop;
    end if;

    -- Build the PRIVATE array first, then project the public one out of the
    -- source. Never build public by deleting keys from private: one missed key
    -- is a silent leak and no test would catch it.
    for i in 0..(v_n - 1) loop
      v_mgr := v_mgrs->i;
      v_priv := v_priv || jsonb_build_array(jsonb_build_object(
        'name',           coalesce(nullif(btrim(v_mgr->>'name'), ''), 'Manager ' || (i + 1)),
        'beta',           coalesce((v_mgr->>'beta')::numeric, 1),
        -- slot i gets the alpha that the permutation sent here
        'alpha',          v_alphas[v_perm[i + 1] + 1],
        'tracking_error', coalesce((v_mgr->>'tracking_error')::numeric, 0)
      ));
    end loop;

    -- Track records are generated AFTER the shuffle, from each slot's
    -- post-shuffle truth, or the histories would contradict the reveal.
    for i in 0..(v_n - 1) loop
      v_mgr := v_mgrs->i;
      v_track := public._gen_track_record(
        (v_priv->i->>'beta')::numeric,
        (v_priv->i->>'alpha')::numeric,
        (v_priv->i->>'tracking_error')::numeric,
        coalesce((v_mgr->>'mgmt_fee')::numeric, 0),
        coalesce((v_mgr->>'perf_fee')::numeric, 0),
        (v_config->>'market_mean')::numeric,
        (v_config->>'market_sd')::numeric
      );
      v_pub := v_pub || jsonb_build_array(jsonb_build_object(
        'name',          coalesce(nullif(btrim(v_mgr->>'name'), ''), 'Manager ' || (i + 1)),
        'strategy_line', coalesce(v_mgr->>'strategy_line', ''),
        'fee_type',      coalesce(v_mgr->>'fee_type', 'flat'),
        'mgmt_fee',      coalesce((v_mgr->>'mgmt_fee')::numeric, 0),
        'perf_fee',      coalesce((v_mgr->>'perf_fee')::numeric, 0),
        'track_record',  v_track - 'vol_label',
        'vol_label',     v_track->>'vol_label'
      ));
    end loop;

    v_config := jsonb_set(v_config, '{managers}', v_pub);
    v_config := jsonb_set(v_config, '{num_managers}', to_jsonb(v_n));
    v_secret := jsonb_build_object('managers', v_priv, 'permutation', to_jsonb(v_perm));
  end if;

  -- unique, human-typeable join code
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions s where s.join_code = v_code);
  end loop;

  insert into public.sessions (join_code, host_id, status, current_round, config)
  values (v_code, v_uid, 'lobby', 0, v_config)
  returning sessions.id into v_id;

  if v_secret is not null then
    insert into public.session_secrets (session_id, secret) values (v_id, v_secret);
  end if;

  return query select v_id, v_code;
end;
$$;

revoke all on function public.create_session(jsonb) from public;
grant execute on function public.create_session(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_manager_allocation — submit_portfolio_allocation with three changes:
-- the cap is leverage_cap * wealth rather than wealth, safe_amount may go
-- NEGATIVE (that is the borrowing), and the game_type check is 'manager'.
-- ---------------------------------------------------------------------------
create or replace function public.submit_manager_allocation(
  p_round_id uuid, p_amounts numeric[]
) returns public.allocations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_round   public.rounds%rowtype;
  v_session public.sessions%rowtype;
  v_player  public.players%rowtype;
  v_n       int;
  v_cap     numeric;
  v_sum     numeric := 0;
  v_amt     numeric;
  v_alloc   public.allocations%rowtype;
  i         int;
begin
  if v_uid is null then
    raise exception 'must be signed in to submit';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;
  if v_round.status <> 'open' then
    raise exception 'this round is not open for submissions';
  end if;

  select * into v_session from public.sessions where id = v_round.session_id;
  if coalesce(v_session.config->>'game_type', 'basic') <> 'manager' then
    raise exception 'this session is not a manager game';
  end if;
  v_n := coalesce((v_session.config->>'num_managers')::int, 5);

  select * into v_player from public.players
    where session_id = v_round.session_id and auth_uid = v_uid and is_active = true;
  if not found then
    raise exception 'you are not an active player in this session';
  end if;

  if p_amounts is null or array_length(p_amounts, 1) <> v_n then
    raise exception 'expected % manager amounts', v_n;
  end if;
  for i in 1..v_n loop
    v_amt := coalesce(p_amounts[i], 0);
    if v_amt < 0 then
      raise exception 'manager amounts must be >= 0';
    end if;
    v_sum := v_sum + v_amt;
  end loop;

  -- Leverage: allocate up to leverage_cap x wealth. Everything above wealth is
  -- borrowed at risk_free_rate + borrow_spread when the year resolves.
  v_cap := coalesce((v_session.config->>'leverage_cap')::numeric, 2.0)
             * v_player.current_wealth;
  -- tiny epsilon so "exactly at the cap" survives client rounding
  if v_sum > v_cap + 0.000001 then
    raise exception 'total allocated (%) exceeds your leverage cap (%)', v_sum, v_cap;
  end if;
  v_sum := least(v_sum, v_cap);

  insert into public.allocations
    (round_id, player_id, risky_amount, safe_amount, risky_breakdown)
  values
    (p_round_id, v_player.id, v_sum, v_player.current_wealth - v_sum,
     to_jsonb(p_amounts))
  on conflict (round_id, player_id) do update
    set risky_amount    = excluded.risky_amount,
        safe_amount     = excluded.safe_amount,
        risky_breakdown = excluded.risky_breakdown,
        submitted_at    = now()
  returning * into v_alloc;

  return v_alloc;
end;
$$;

revoke all on function public.submit_manager_allocation(uuid, numeric[]) from public;
grant execute on function public.submit_manager_allocation(uuid, numeric[]) to authenticated;

-- ---------------------------------------------------------------------------
-- add_benchmark_bots — manager games get exactly ONE synthetic competitor:
-- 'The Index', which compounds the market return with no fees and no leverage.
-- It is the thing the whole module is about being unable to beat, and it is the
-- only benchmark that belongs in the standings.
-- ---------------------------------------------------------------------------
create or replace function public.add_benchmark_bots(p_session_id uuid)
returns setof public.players
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_start   numeric;
  v_type    text;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: host only';
  end if;
  if v_session.status <> 'lobby' then
    raise exception 'benchmark students can only be added before the game starts';
  end if;

  -- idempotent: do nothing if bots already exist for this session
  if exists (select 1 from public.players where session_id = p_session_id and is_bot) then
    return query select * from public.players where session_id = p_session_id and is_bot;
    return;
  end if;

  v_start := coalesce((v_session.config->>'starting_wealth')::numeric, 100);
  v_type  := coalesce(v_session.config->>'game_type', 'basic');

  if v_type = 'manager' then
    return query
    insert into public.players (session_id, auth_uid, display_name, current_wealth, is_bot, strategy)
    values (p_session_id, null, 'The Index', v_start, true, 'index')
    returning *;
  elsif v_type = 'portfolio' then
    return query
    insert into public.players (session_id, auth_uid, display_name, current_wealth, is_bot, strategy)
    values
      (p_session_id, null, 'Bot · All-safe',    v_start, true, 'all_safe'),
      (p_session_id, null, 'Bot · One-basket',  v_start, true, 'concentrated'),
      (p_session_id, null, 'Bot · Half & half', v_start, true, 'half_diversified'),
      (p_session_id, null, 'Bot · Diversified', v_start, true, 'diversified')
    returning *;
  else
    return query
    insert into public.players (session_id, auth_uid, display_name, current_wealth, is_bot, strategy)
    values
      (p_session_id, null, 'Bot · All-safe',  v_start, true, 'all_safe'),
      (p_session_id, null, 'Bot · Edge',      v_start, true, 'edge'),
      (p_session_id, null, 'Bot · 50/50',     v_start, true, 'fifty_fifty'),
      (p_session_id, null, 'Bot · All-risky', v_start, true, 'all_risky')
    returning *;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_leaderboard — 0013's body, except the index is let through.
--
-- Benchmark bots stay out of student-facing rankings (0013's rule), but 'The
-- Index' is not a competitor to be hidden: seeing it sitting above you in the
-- list every year IS the module. get_my_rank is deliberately NOT changed, so
-- "you finished 4th of 30" keeps counting humans only.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_session_id uuid)
returns table (player_id uuid, display_name text, current_wealth numeric,
               rank int, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  if not (public.is_session_host(p_session_id)
          or public.session_show_leaderboard(p_session_id)) then
    raise exception 'the full leaderboard is hidden from students in this session';
  end if;

  return query
    select p.id, p.display_name, p.current_wealth,
           (rank() over (order by p.current_wealth desc))::int,
           (p.auth_uid = auth.uid())
    from public.players p
    where p.session_id = p_session_id and p.is_active = true
      and (p.is_bot = false or p.strategy = 'index')
    order by p.current_wealth desc, p.joined_at asc;
end;
$$;
