-- =============================================================================
-- 0035_research.sql — friction as an experimental variable, consent, and the
-- research export (docs/PAPER_TRADING.md §8; plan Phase 7).
--
-- WHY: the Markets section exists for research on how friction changes
-- trading. 0032/0033 log behaviour and read one preset per session; this adds
-- what an experiment needs, as section-level pieces the betting and
-- prediction-market games will reuse:
--   * per-knob overrides on top of a preset (config.friction_overrides), and
--     per-player balanced assignment to arms (config.friction_assignment =
--     'per_player', config.friction_arms). Assignments live in
--     player_conditions: server-only, never shown to the student, who gets only
--     the resolved knobs (get_my_conditions); the host sees the arms
--     (get_session_conditions). Friction and research settings are fixed once
--     the session exists, since changing them mid-game breaks the experiment;
--   * the cooldown between orders, enforced by place_order (the other knobs
--     are screens; this one is a rule);
--   * research_mode consent: research_consents + record_consent. With research
--     mode on, nothing is logged and no order context is kept for a student
--     who has not agreed (log_behavior_events, place_order), and saying no
--     later deletes what was logged;
--   * export_research_data for the host: pseudonymous IDs only, consenting
--     students only in research mode;
--   * round-phase timestamps: rounds.opened_at and rounds.locked_at (the
--     generic round clock; closes_at and revealed_at already exist).
--
-- place_order and log_behavior_events are 0033's bodies with the additions
-- marked "0035". MIRRORED by lib/research/friction.ts (presets, overrides,
-- validation, assignment), lib/research/consent.ts and lib/research/export.ts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Defaults gain the friction setup. 0033's list plus three keys.
-- MIRRORS TRADING_DEFAULTS in lib/markets/trading/config.ts.
-- ---------------------------------------------------------------------------
create or replace function public._trading_config_defaults()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'game_type', 'trading',
    'num_rounds', 25,
    'period', 'quarter',
    'starting_wealth', 100000,
    'round_seconds', 90,
    'universe_size', 25,
    'allow_late_join', false,
    'show_full_leaderboard_to_students', true,
    'margin_enabled', true,
    'initial_margin', 0.5,
    'maint_long', 0.25,
    'maint_short', 0.30,
    'shorting_enabled', true,
    'borrow_fee', 0.003,
    'borrow_spread', 0.05,
    'spread', 0.001,
    'commission', 0,
    'headlines', true,
    'friction_profile', 'standard',
    'friction_assignment', 'session',
    'friction_arms', jsonb_build_array('low', 'high'),
    'friction_overrides', '{}'::jsonb,
    'research_mode', false
  );
$$;

-- ---------------------------------------------------------------------------
-- The presets. MIRRORS FRICTION_PRESETS in lib/research/friction.ts (the
-- markets self-test and friction.test.ts assert the same 'high' literal).
-- ---------------------------------------------------------------------------
create or replace function public._friction_preset(p_profile text)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case p_profile
    when 'low' then
      '{"one_tap_buy": true, "amount_chips": true, "review_step": false, "typed_confirmation": false,
        "cooldown_seconds": 0, "risk_disclosure": false, "celebrate_fills": true, "show_movers": true,
        "show_class_popular": true}'::jsonb
    when 'high' then
      '{"one_tap_buy": false, "amount_chips": false, "review_step": true, "typed_confirmation": true,
        "cooldown_seconds": 30, "risk_disclosure": true, "celebrate_fills": false, "show_movers": false,
        "show_class_popular": false}'::jsonb
    else
      '{"one_tap_buy": false, "amount_chips": true, "review_step": true, "typed_confirmation": false,
        "cooldown_seconds": 0, "risk_disclosure": false, "celebrate_fills": false, "show_movers": true,
        "show_class_popular": false}'::jsonb
  end;
$$;

-- Every problem with a config's friction settings, in the words the setup form
-- shows. MIRRORS frictionProblems in lib/research/friction.ts.
create or replace function public._friction_problems(p_config jsonb)
returns text[] language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_out  text[] := '{}';
  v_arms jsonb := coalesce(p_config->'friction_arms', '["low", "high"]'::jsonb);
  v_o    jsonb := coalesce(p_config->'friction_overrides', '{}'::jsonb);
  v_bad  boolean;
  k      text;
  v      jsonb;
begin
  if jsonb_typeof(coalesce(p_config->'friction_assignment', '"session"'::jsonb)) <> 'string'
     or coalesce(p_config->>'friction_assignment', 'session') not in ('session', 'per_player') then
    v_out := array_append(v_out, 'friction_assignment must be session or per_player');
  end if;

  v_bad := jsonb_typeof(v_arms) <> 'array';
  if not v_bad then
    v_bad := jsonb_array_length(v_arms) not between 2 and 3
      or exists (select 1 from jsonb_array_elements(v_arms) a
                  where jsonb_typeof(a) <> 'string' or a #>> '{}' not in ('low', 'standard', 'high'))
      or (select count(distinct a #>> '{}') from jsonb_array_elements(v_arms) a) <> jsonb_array_length(v_arms);
  end if;
  if v_bad then
    v_out := array_append(v_out, 'friction_arms must list two or three different friction profiles');
  end if;

  if jsonb_typeof(v_o) <> 'object' then
    return array_append(v_out, 'friction_overrides must be an object');
  end if;
  for k, v in select e.key, e.value from jsonb_each(v_o) e loop
    if k not in ('one_tap_buy', 'amount_chips', 'review_step', 'typed_confirmation', 'cooldown_seconds',
                 'risk_disclosure', 'celebrate_fills', 'show_movers', 'show_class_popular') then
      v_out := array_append(v_out, format('unknown friction knob: %s', k));
    elsif k = 'cooldown_seconds' then
      if jsonb_typeof(v) <> 'number'
         or (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric)
         or (v #>> '{}')::numeric not between 0 and 300 then
        v_out := array_append(v_out, 'cooldown_seconds must be a whole number from 0 to 300');
      end if;
    elsif jsonb_typeof(v) <> 'boolean' then
      v_out := array_append(v_out, format('friction knob %s must be true or false', k));
    end if;
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Friction and research settings are checked when a trading session is made
-- and fixed from then on. A trigger, so create_trading_session (0033) stays
-- untouched and no later path can slip a change in.
-- ---------------------------------------------------------------------------
create or replace function public.sessions_research_settings()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_problems text[];
  k          text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.config->>'game_type', '') <> 'trading' then return new; end if;
    v_problems := public._friction_problems(new.config);
    if cardinality(v_problems) > 0 then
      raise exception '%', v_problems[1] using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if coalesce(old.config->>'game_type', '') <> 'trading' and coalesce(new.config->>'game_type', '') <> 'trading' then
    return new;
  end if;
  foreach k in array array['game_type', 'friction_profile', 'friction_assignment', 'friction_arms',
                           'friction_overrides', 'research_mode'] loop
    if old.config->k is distinct from new.config->k then
      raise exception 'friction and research settings are fixed once a session exists'
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists sessions_research_settings on public.sessions;
create trigger sessions_research_settings
  before insert or update of config on public.sessions
  for each row execute function public.sessions_research_settings();

-- ---------------------------------------------------------------------------
-- Round-phase timestamps (section-level round clock). opened_at is stamped on
-- insert from now on (older rounds stay null); locked_at when a round locks.
-- ---------------------------------------------------------------------------
alter table public.rounds add column if not exists opened_at timestamptz null;
alter table public.rounds alter column opened_at set default now();
alter table public.rounds add column if not exists locked_at timestamptz null;

create or replace function public.rounds_stamp_locked()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'locked' and old.status is distinct from 'locked' then
    new.locked_at := coalesce(new.locked_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists rounds_stamp_locked on public.rounds;
create trigger rounds_stamp_locked
  before update of status on public.rounds
  for each row execute function public.rounds_stamp_locked();

-- ---------------------------------------------------------------------------
-- Server-only research state.
-- ---------------------------------------------------------------------------
-- The friction profile ("arm") a player was assigned in a per-player session.
create table if not exists public.player_conditions (
  player_id   uuid primary key references public.players (id) on delete cascade,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  arm         text not null check (arm in ('low', 'standard', 'high')),
  assigned_at timestamptz not null default now()
);
create index if not exists player_conditions_session_idx on public.player_conditions (session_id, arm);

-- A player's answer on the consent screen, in a research-mode session.
create table if not exists public.research_consents (
  player_id       uuid primary key references public.players (id) on delete cascade,
  session_id      uuid not null references public.sessions (id) on delete cascade,
  consented       boolean not null,
  -- which consent text they saw (lib/research/consent.ts CONSENT_VERSION)
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  decided_at      timestamptz not null default now()
);
create index if not exists research_consents_session_idx on public.research_consents (session_id);

-- The export pages through a session's events in id order.
create index if not exists behavior_events_session_id_idx on public.behavior_events (session_id, id);

do $$
declare t text;
begin
  foreach t in array array['player_conditions', 'research_consents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Balanced assignment when a student joins a per-player session: the arm with
-- the fewest players so far (removed players included: an assignment is
-- permanent), ties at random. That is permuted-block randomization with
-- blocks the size of the arm list. The session row is locked so two joins at
-- once cannot both take the same empty arm.
-- MIRRORS assignArm in lib/research/friction.ts.
-- ---------------------------------------------------------------------------
create or replace function public.players_assign_condition()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cfg jsonb;
  v_arm text;
begin
  if new.is_bot then return null; end if;
  select s.config into v_cfg from public.sessions s where s.id = new.session_id;
  if coalesce(v_cfg->>'friction_assignment', 'session') <> 'per_player' then return null; end if;
  perform 1 from public.sessions s where s.id = new.session_id for update;

  select a.arm into v_arm
    from jsonb_array_elements_text(v_cfg->'friction_arms') a(arm)
    left join (select pc.arm, count(*) as n from public.player_conditions pc
                where pc.session_id = new.session_id group by pc.arm) c on c.arm = a.arm
   order by coalesce(c.n, 0), random()
   limit 1;
  insert into public.player_conditions (player_id, session_id, arm)
  values (new.id, new.session_id, v_arm)
  on conflict (player_id) do nothing;
  return null;
end;
$$;

drop trigger if exists players_assign_condition on public.players;
create trigger players_assign_condition
  after insert on public.players
  for each row execute function public.players_assign_condition();

-- ---------------------------------------------------------------------------
-- Internal helpers.
-- ---------------------------------------------------------------------------
-- The knobs a player's screens obey: their arm's preset (or the session's
-- profile), with the session's overrides on top. MIRRORS knobsFor.
create or replace function public._friction_knobs(p_session_id uuid, p_player_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select public._friction_preset(coalesce(pc.arm, s.config->>'friction_profile', 'standard'))
         || coalesce(s.config->'friction_overrides', '{}'::jsonb)
    from public.sessions s
    left join public.player_conditions pc on pc.player_id = p_player_id and pc.session_id = s.id
   where s.id = p_session_id;
$$;

-- May this player's behaviour be kept? Always outside research mode; inside
-- it, only after they agreed.
create or replace function public._research_ok(p_session_id uuid, p_player_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not coalesce((s.config->>'research_mode')::boolean, false)
         or coalesce((select rc.consented from public.research_consents rc where rc.player_id = p_player_id), false)
    from public.sessions s where s.id = p_session_id;
$$;

-- The students an export covers, under pseudonyms: no names, no account ids.
-- In research mode, only those who agreed.
create or replace function public._research_players(p_session_id uuid)
returns table (player_id uuid, pid text, arm text, consented boolean, active boolean, joined_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id,
         'P' || upper(substr(md5(p_session_id::text || ':' || p.id::text), 1, 8)),
         coalesce(pc.arm, s.config->>'friction_profile', 'standard'),
         rc.consented,
         p.is_active,
         p.joined_at
    from public.players p
    join public.sessions s on s.id = p.session_id
    left join public.player_conditions pc on pc.player_id = p.id
    left join public.research_consents rc on rc.player_id = p.id
   where p.session_id = p_session_id and not p.is_bot
     and (not coalesce((s.config->>'research_mode')::boolean, false) or rc.consented is true);
$$;

-- =============================================================================
-- get_my_conditions — what this student's screens obey: the resolved knobs
-- (never the arm's name), and where they stand on consent.
-- =============================================================================
create or replace function public.get_my_conditions(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_player uuid;
  v_cfg    jsonb;
  v_c      public.research_consents%rowtype;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  select p.id into v_player from public.players p
   where p.session_id = p_session_id and p.auth_uid = auth.uid() and not p.is_bot;
  if v_player is null then raise exception 'you are not a player in this session'; end if;
  select s.config into v_cfg from public.sessions s where s.id = p_session_id;
  if coalesce(v_cfg->>'game_type', '') <> 'trading' then
    raise exception 'this session has no friction settings';
  end if;
  select * into v_c from public.research_consents rc where rc.player_id = v_player;
  return jsonb_build_object(
    'knobs', public._friction_knobs(p_session_id, v_player),
    'research_mode', coalesce((v_cfg->>'research_mode')::boolean, false),
    'consent', v_c.consented,
    'consent_version', v_c.consent_version);
end;
$$;

-- =============================================================================
-- get_session_conditions — the host's view of the experiment: the setup, how
-- many active students are in each arm, each student's arm, and consent counts.
-- =============================================================================
create or replace function public.get_session_conditions(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id is distinct from auth.uid() then raise exception 'not authorized: host only'; end if;
  if coalesce(v_session.config->>'game_type', '') <> 'trading' then
    raise exception 'this session has no friction settings';
  end if;
  return (
    with ps as (
      select p.id, coalesce(pc.arm, v_session.config->>'friction_profile', 'standard') as arm, rc.consented
        from public.players p
        left join public.player_conditions pc on pc.player_id = p.id
        left join public.research_consents rc on rc.player_id = p.id
       where p.session_id = p_session_id and p.is_active and not p.is_bot
    )
    select jsonb_build_object(
      'assignment', coalesce(v_session.config->>'friction_assignment', 'session'),
      'profile', coalesce(v_session.config->>'friction_profile', 'standard'),
      'arms', coalesce(v_session.config->'friction_arms', '[]'::jsonb),
      'overrides', coalesce(v_session.config->'friction_overrides', '{}'::jsonb),
      'research_mode', coalesce((v_session.config->>'research_mode')::boolean, false),
      'arm_counts', (select coalesce(jsonb_agg(jsonb_build_object('arm', c.arm, 'players', c.n) order by c.arm), '[]'::jsonb)
                       from (select ps.arm, count(*) as n from ps group by ps.arm) c),
      'players', (select coalesce(jsonb_agg(jsonb_build_object('player_id', ps.id, 'arm', ps.arm)), '[]'::jsonb) from ps),
      'consent', jsonb_build_object(
        'agreed', (select count(*) from ps where ps.consented is true),
        'declined', (select count(*) from ps where ps.consented is false),
        'undecided', (select count(*) from ps where ps.consented is null)))
  );
end;
$$;

-- =============================================================================
-- record_consent — the student's answer on the consent screen (research-mode
-- sessions only). Changeable; saying no deletes their behaviour log and the
-- order context kept so far (their trades stay: the game needs them, and the
-- export leaves them out).
-- =============================================================================
create or replace function public.record_consent(p_session_id uuid, p_consented boolean, p_version text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_player uuid;
  v_cfg    jsonb;
  v_row    public.research_consents%rowtype;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  select p.id into v_player from public.players p
   where p.session_id = p_session_id and p.auth_uid = auth.uid() and not p.is_bot;
  if v_player is null then raise exception 'you are not a player in this session'; end if;
  select s.config into v_cfg from public.sessions s where s.id = p_session_id;
  if not coalesce((v_cfg->>'research_mode')::boolean, false) then
    raise exception 'this session is not part of a research study';
  end if;
  if p_consented is null then raise exception 'answer yes or no'; end if;
  if p_version is null or char_length(trim(p_version)) not between 1 and 40 then
    raise exception 'the consent version must be 1 to 40 characters';
  end if;

  insert into public.research_consents (player_id, session_id, consented, consent_version, decided_at)
  values (v_player, p_session_id, p_consented, trim(p_version), now())
  on conflict (player_id) do update
    set consented = excluded.consented, consent_version = excluded.consent_version, decided_at = now()
  returning * into v_row;

  if not p_consented then
    delete from public.behavior_events where player_id = v_player;
    update public.market_orders set context = null where player_id = v_player and context is not null;
  end if;

  return jsonb_build_object('consented', v_row.consented, 'consent_version', v_row.consent_version,
                            'decided_at', v_row.decided_at);
end;
$$;

-- =============================================================================
-- place_order — 0033's body, plus the cooldown and the consent rule ("0035").
--
-- p_order: {slot, side, order_type, quantity | notional, limit_price?,
--           stop_price?, tif?, client_ref?, context?}
-- Buying power MIRRORS lib/markets/trading/orders.ts (see 0033 for the rules).
-- 0035: an order inside the player's cooldown (friction knob cooldown_seconds,
-- counted from their last placed order) is refused with the seconds left; an
-- idempotent retry is not a new order and is never refused for it. In research
-- mode the decision context is dropped unless the student agreed.
-- =============================================================================
create or replace function public.place_order(p_session_id uuid, p_order jsonb)
returns public.market_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_session  public.sessions%rowtype;
  v_round    public.rounds%rowtype;
  v_player   public.players%rowtype;
  v_acct     public.market_accounts%rowtype;
  v_order    public.market_orders%rowtype;
  v_cfg      jsonb;
  v_slot     smallint;
  v_side     text;
  v_type     text;
  v_tif      text;
  v_qty      numeric;
  v_notional numeric;
  v_limit    numeric;
  v_stop     numeric;
  v_ref      text;
  v_ctx      jsonb;
  v_last_day int;
  v_delist   int;
  v_price    numeric;
  v_spread   numeric;
  v_comm     numeric;
  v_im       numeric;
  v_pos      numeric;
  v_closing  numeric;
  v_lmv      numeric;
  v_smv      numeric;
  v_equity   numeric;
  v_held     numeric;
  v_ref_px   numeric;
  v_reserve  numeric := 0;
  v_free     numeric;
  v_cool     int;
  v_wait     numeric;
begin
  if v_uid is null then raise exception 'must be signed in to trade'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found or coalesce(v_session.config->>'game_type', '') <> 'trading' then
    raise exception 'not a paper trading session';
  end if;
  v_cfg := v_session.config;
  if v_session.status <> 'active' then
    raise exception 'trading is closed: the game is not running';
  end if;

  select * into v_player from public.players
   where session_id = p_session_id and auth_uid = v_uid and is_active and not is_bot;
  if not found then raise exception 'you are not a player in this session'; end if;

  select * into v_round from public.rounds
   where session_id = p_session_id and round_number = v_session.current_round;
  if not found or v_round.status <> 'open' then
    raise exception 'trading is closed for this round';
  end if;
  if v_round.closes_at is not null and now() >= v_round.closes_at then
    raise exception 'time is up for this round';
  end if;

  -- One order at a time per player: everything below reads and reserves against
  -- this account, so a double-tap cannot spend the same buying power twice.
  select * into v_acct from public.market_accounts where player_id = v_player.id for update;
  if not found then raise exception 'you have no trading account in this session'; end if;

  -- An idempotent retry returns the order the first attempt created.
  v_ref := nullif(trim(p_order->>'client_ref'), '');
  if v_ref is not null then
    if char_length(v_ref) > 64 then raise exception 'client_ref is too long'; end if;
    select * into v_order from public.market_orders where player_id = v_player.id and client_ref = v_ref;
    if found then return v_order; end if;
  end if;

  -- 0035: the friction profile's wait between orders is a rule, not a screen
  v_cool := coalesce((public._friction_knobs(p_session_id, v_player.id)->>'cooldown_seconds')::int, 0);
  if v_cool > 0 and v_acct.last_order_at is not null then
    v_wait := extract(epoch from (v_acct.last_order_at + make_interval(secs => v_cool) - now()));
    if v_wait > 0 then
      raise exception 'wait % more second% before your next order',
        ceil(v_wait)::int, case when ceil(v_wait) = 1 then '' else 's' end;
    end if;
  end if;

  -- ---- parse --------------------------------------------------------------
  v_side := p_order->>'side';
  if v_side is null or v_side not in ('buy', 'sell', 'sell_short', 'buy_to_cover') then
    raise exception 'side must be buy, sell, sell_short or buy_to_cover'; end if;
  v_type := coalesce(p_order->>'order_type', 'market');
  if v_type not in ('market', 'limit', 'stop', 'stop_limit') then
    raise exception 'order_type must be market, limit, stop or stop_limit'; end if;
  v_tif := coalesce(p_order->>'tif', 'round');
  if v_tif not in ('round', 'gtc') then raise exception 'tif must be round or gtc'; end if;
  if v_type = 'market' then v_tif := 'round'; end if;

  begin
    v_slot     := (p_order->>'slot')::smallint;
    v_qty      := nullif(p_order->>'quantity', '')::numeric;
    v_notional := nullif(p_order->>'notional', '')::numeric;
    v_limit    := nullif(p_order->>'limit_price', '')::numeric;
    v_stop     := nullif(p_order->>'stop_price', '')::numeric;
  exception when others then
    raise exception 'slot, quantity, notional and prices must be numbers';
  end;
  if (v_qty is null) = (v_notional is null) then
    raise exception 'give either a number of shares or a dollar amount'; end if;
  if v_notional is not null and v_type <> 'market' then
    raise exception 'dollar amounts are for market orders; enter shares for this order type'; end if;
  if v_qty is not null then
    v_qty := round(v_qty, 6);
    if v_qty <= 0 or v_qty > 1000000000 then raise exception 'shares must be more than 0'; end if;
  end if;
  if v_notional is not null and (v_notional < 1 or v_notional > 10000000000) then
    raise exception 'the dollar amount must be at least $1'; end if;
  if (v_type in ('limit', 'stop_limit')) <> (v_limit is not null) then
    raise exception 'a % order % a limit price', replace(v_type, '_', '-'),
      case when v_type in ('limit', 'stop_limit') then 'needs' else 'does not take' end; end if;
  if (v_type in ('stop', 'stop_limit')) <> (v_stop is not null) then
    raise exception 'a % order % a stop price', replace(v_type, '_', '-'),
      case when v_type in ('stop', 'stop_limit') then 'needs' else 'does not take' end; end if;
  if coalesce(v_limit, 1) <= 0 or coalesce(v_stop, 1) <= 0
     or coalesce(v_limit, 0) > 10000000 or coalesce(v_stop, 0) > 10000000 then
    raise exception 'prices must be above $0'; end if;
  v_limit := round(v_limit, 4);
  v_stop  := round(v_stop, 4);
  if v_side = 'sell_short' and not coalesce((v_cfg->>'shorting_enabled')::boolean, false) then
    raise exception 'short selling is off in this session'; end if;
  if not exists (select 1 from public.session_instruments si
                  where si.session_id = p_session_id and si.slot = v_slot) then
    raise exception 'unknown instrument'; end if;
  v_ctx := p_order->'context';
  if v_ctx is not null and (jsonb_typeof(v_ctx) <> 'object' or octet_length(v_ctx::text) > 2048) then
    v_ctx := null;
  end if;
  -- 0035: in research mode, what the student saw is kept only with their consent
  if not public._research_ok(p_session_id, v_player.id) then
    v_ctx := null;
  end if;

  -- ---- caps -----------------------------------------------------------------
  if (select count(*) from public.market_orders o
       where o.player_id = v_player.id and o.status = 'open') >= 50 then
    raise exception 'you have 50 open orders; cancel some first'; end if;
  if (select count(*) from public.market_orders o
       where o.player_id = v_player.id and o.placed_round = v_session.current_round) >= 100 then
    raise exception 'you have placed 100 orders this round'; end if;

  -- ---- prices at the last revealed close ---------------------------------
  v_last_day := public._trading_last_revealed_day(p_session_id);
  select i.delist_day into v_delist
    from public.session_instrument_secrets s
    join public.market_instruments i on i.id = s.instrument_id
   where s.session_id = p_session_id and s.slot = v_slot;
  if v_delist is not null and v_delist <= v_last_day then
    raise exception 'that company no longer trades'; end if;
  select lp.price into v_price from public._trading_last_prices(p_session_id, v_last_day) lp
   where lp.slot = v_slot;
  if v_price is null or v_price <= 0 then raise exception 'no price yet for that instrument'; end if;

  v_spread := coalesce((v_cfg->>'spread')::numeric, 0.001);
  v_comm   := coalesce((v_cfg->>'commission')::numeric, 0);
  v_im     := case when coalesce((v_cfg->>'margin_enabled')::boolean, false)
                   then coalesce((v_cfg->>'initial_margin')::numeric, 0.5) else 1 end;

  -- dollars -> shares at the price a market order is expected to fill at
  if v_notional is not null then
    v_qty := round(v_notional / (v_price * (1 + case when v_side in ('buy', 'buy_to_cover')
                                                     then v_spread / 2 else -v_spread / 2 end)), 6);
    if v_qty <= 0 then raise exception 'that dollar amount buys no shares'; end if;
  end if;

  -- ---- the position this order acts on -------------------------------------
  select coalesce(mp.quantity, 0) into v_pos
    from (select 1) x left join public.market_positions mp
      on mp.player_id = v_player.id and mp.slot = v_slot;
  v_pos := coalesce(v_pos, 0);

  if v_side = 'buy' and v_pos < 0 then
    raise exception 'you are short this one: use buy to cover first'; end if;
  if v_side = 'sell_short' and v_pos > 0 then
    raise exception 'you own this one: sell it before selling short'; end if;
  if v_acct.frozen and v_side in ('buy', 'sell_short') then
    raise exception 'your account is frozen: you can only close positions'; end if;

  if v_side in ('sell', 'buy_to_cover') then
    -- shares already promised to other open closing orders on this slot
    select coalesce(sum(coalesce(o.quantity, o.notional / v_price)), 0) into v_closing
      from public.market_orders o
     where o.player_id = v_player.id and o.slot = v_slot and o.status = 'open' and o.side = v_side;
    v_held := case when v_side = 'sell' then greatest(v_pos, 0) else greatest(-v_pos, 0) end;
    if v_qty > v_held - v_closing + 0.0000005 then
      raise exception 'you can % at most % shares', replace(v_side, '_', ' '),
        round(greatest(v_held - v_closing, 0), 6); end if;
  else
    -- an order that adds exposure must fit in buying power
    select coalesce(sum(case when mp.quantity > 0 then mp.quantity * lp.price else 0 end), 0),
           coalesce(sum(case when mp.quantity < 0 then -mp.quantity * lp.price else 0 end), 0)
      into v_lmv, v_smv
      from public.market_positions mp
      join public._trading_last_prices(p_session_id, v_last_day) lp on lp.slot = mp.slot
     where mp.player_id = v_player.id;
    v_equity := v_acct.cash + v_lmv - v_smv;
    v_ref_px := case
      when v_side = 'buy' and v_type = 'market'     then v_price
      when v_side = 'buy' and v_type = 'limit'      then v_limit
      when v_side = 'buy' and v_type = 'stop'       then greatest(v_stop, v_price)
      when v_side = 'buy' and v_type = 'stop_limit' then v_limit
      when v_type in ('limit', 'stop_limit')        then greatest(v_limit, v_price)
      else v_price
    end;
    v_reserve := round(v_qty * v_ref_px * (v_im + v_spread / 2) + v_comm, 4);
    select v_equity - v_im * (v_lmv + v_smv) - coalesce(sum(o.reserved), 0) into v_free
      from public.market_orders o where o.player_id = v_player.id and o.status = 'open';
    if v_free + 0.005 < v_reserve then
      raise exception 'not enough buying power: this order needs $%, you have $% available',
        to_char(v_reserve, 'FM999,999,999,990.00'), to_char(greatest(v_free, 0), 'FM999,999,999,990.00');
    end if;
  end if;

  insert into public.market_orders (session_id, player_id, slot, side, order_type, quantity, notional,
    limit_price, stop_price, tif, reserved, placed_round, client_ref, context)
  values (p_session_id, v_player.id, v_slot, v_side, v_type,
          case when v_notional is null then v_qty end, v_notional,
          v_limit, v_stop, v_tif, v_reserve, v_session.current_round, v_ref, v_ctx)
  returning * into v_order;

  update public.market_accounts set last_order_at = now(), updated_at = now()
   where player_id = v_player.id;
  return v_order;
end;
$$;

-- =============================================================================
-- log_behavior_events — 0033's body, plus: in research mode a student who has
-- not agreed is accepted and nothing is kept (returns 0, so a client never
-- retries it).
-- =============================================================================
create or replace function public.log_behavior_events(p_session_id uuid, p_events jsonb)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_player uuid;
  v_round  int;
  v_n      int;
  v_rate   public.behavior_rate%rowtype;
  e        jsonb;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  select p.id, s.current_round into v_player, v_round
    from public.players p join public.sessions s on s.id = p.session_id
   where p.session_id = p_session_id and p.auth_uid = v_uid and not p.is_bot;
  if v_player is null then raise exception 'you are not a player in this session'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'events must be an array'; end if;
  v_n := jsonb_array_length(p_events);
  if v_n = 0 then return 0; end if;
  if v_n > 50 then raise exception 'at most 50 events per call'; end if;

  for e in select * from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'type', '') !~ '^[a-z][a-z_]{0,39}$' then
      raise exception 'each event needs a type of lowercase letters and underscores';
    end if;
    if e ? 'payload' and jsonb_typeof(e->'payload') <> 'object' then
      raise exception 'an event payload must be an object';
    end if;
    if e ? 'payload' and octet_length((e->'payload')::text) > 2048 then
      raise exception 'an event payload must be at most 2 KB';
    end if;
  end loop;

  -- 0035: in research mode nothing is kept without the student's consent
  if not public._research_ok(p_session_id, v_player) then
    return 0;
  end if;

  insert into public.behavior_rate as br (player_id, window_start, calls, events)
  values (v_player, now(), 1, v_n)
  on conflict (player_id) do update
    set window_start = case when br.window_start < now() - interval '1 minute' then now() else br.window_start end,
        calls  = case when br.window_start < now() - interval '1 minute' then 1 else br.calls + 1 end,
        events = case when br.window_start < now() - interval '1 minute' then v_n else br.events + v_n end
  returning * into v_rate;
  if v_rate.calls > 30 or v_rate.events > 600 then
    raise exception 'too many events: slow down';
  end if;

  insert into public.behavior_events (session_id, player_id, round_number, event_type, client_ts, payload)
  select p_session_id, v_player, v_round, x->>'type', public._try_timestamptz(x->>'ts'),
         coalesce(x->'payload', '{}'::jsonb)
    from jsonb_array_elements(p_events) x;
  return v_n;
end;
$$;

-- =============================================================================
-- export_research_data — the host's research export (paper trading).
--   p_part 'tables': the session, players, rounds, per-round accounts, orders,
--                    fills, instruments and each period's closing prices;
--   p_part 'events': the behaviour log, 5,000 events a page after p_after
--                    (follow 'next' until it is null).
-- Players appear as pseudonyms ("P" + 8 hex characters, stable within the
-- session): no display names, no account or player ids. In research mode,
-- only students who agreed. The host already sees the real era
-- (get_trading_truth), so the window's first date is included to turn game
-- days into dates.
-- =============================================================================
create or replace function public.export_research_data(p_session_id uuid, p_part text default 'tables',
                                                       p_after bigint default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_ms      public.market_session_secrets%rowtype;
  v_jan1    int;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id is distinct from auth.uid() then raise exception 'not authorized: host only'; end if;
  if coalesce(v_session.config->>'game_type', '') <> 'trading' then
    raise exception 'the research export is for paper trading sessions';
  end if;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'trading session is missing its market window'; end if;
  v_jan1 := public._mkt_day(make_date(v_ms.start_year, 1, 1));

  if p_part = 'events' then
    return (
      with e as (
        select be.id, rp.pid, be.round_number, be.event_type, be.client_ts, be.server_ts, be.payload
          from public.behavior_events be
          join public._research_players(p_session_id) rp on rp.player_id = be.player_id
         where be.session_id = p_session_id and be.id > coalesce(p_after, 0)
         order by be.id
         limit 5000
      )
      select jsonb_build_object(
        'events', coalesce(jsonb_agg(jsonb_build_object(
                    'id', e.id, 'pid', e.pid, 'round', e.round_number, 'type', e.event_type,
                    'client_ts', e.client_ts, 'server_ts', e.server_ts, 'payload', e.payload) order by e.id),
                  '[]'::jsonb),
        'next', case when count(*) = 5000 then max(e.id) end)
      from e);
  elsif p_part is distinct from 'tables' then
    raise exception 'p_part must be tables or events';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'session', jsonb_build_object(
      'status', v_session.status,
      'created_at', v_session.created_at,
      'current_round', v_session.current_round,
      -- the host's label can name the class; it stays out
      'config', v_session.config - 'label',
      'window_first_date', public._mkt_date(v_ms.window_first_day),
      'players_total', (select count(*) from public.players p where p.session_id = p_session_id and not p.is_bot),
      'players_included', (select count(*) from public._research_players(p_session_id))),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'pid', rp.pid, 'arm', rp.arm, 'consented', rp.consented, 'active', rp.active,
               'joined_at', rp.joined_at, 'nlv', a.nlv, 'max_drawdown', a.max_drawdown, 'sharpe', a.sharpe,
               'frozen', a.frozen, 'knobs', public._friction_knobs(p_session_id, rp.player_id))
             order by rp.joined_at, rp.pid), '[]'::jsonb)
        from public._research_players(p_session_id) rp
        left join public.market_accounts a on a.player_id = rp.player_id),
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'round', r.round_number, 'status', r.status, 'opened_at', r.opened_at,
               'closes_at', r.closes_at, 'locked_at', r.locked_at, 'revealed_at', r.revealed_at,
               'first_game_day', pr.first_game_day, 'last_game_day', pr.last_game_day,
               'index_return', pr.index_return, 'movers', coalesce(pr.movers, '[]'::jsonb))
             order by r.round_number), '[]'::jsonb)
        from public.rounds r
        left join public.market_period_results pr
          on pr.session_id = r.session_id and pr.round_number = r.round_number
       where r.session_id = p_session_id),
    'account_rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'pid', rp.pid, 'round', ar.round_number, 'nlv_start', ar.nlv_start, 'nlv_end', ar.nlv_end,
               'traded', ar.traded)
             order by ar.round_number, rp.pid), '[]'::jsonb)
        from public.market_account_rounds ar
        join public._research_players(p_session_id) rp on rp.player_id = ar.player_id),
    'orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'order_id', o.id, 'pid', rp.pid, 'round', o.placed_round, 'slot', o.slot, 'side', o.side,
               'order_type', o.order_type, 'quantity', o.quantity, 'notional', o.notional,
               'limit_price', o.limit_price, 'stop_price', o.stop_price, 'tif', o.tif, 'status', o.status,
               'reject_reason', o.reject_reason, 'placed_at', o.placed_at, 'closed_at', o.closed_at,
               'context', o.context)
             order by o.placed_at, o.id), '[]'::jsonb)
        from public.market_orders o
        join public._research_players(p_session_id) rp on rp.player_id = o.player_id),
    'fills', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'order_id', f.order_id, 'pid', rp.pid, 'round', f.round_number, 'game_day', f.game_day,
               'slot', f.slot, 'side', f.side, 'quantity', f.quantity, 'price', f.price,
               'notional', f.notional, 'commission', f.commission, 'reason', f.reason)
             order by f.round_number, f.game_day, f.created_at, f.id), '[]'::jsonb)
        from public.market_fills f
        join public._research_players(p_session_id) rp on rp.player_id = f.player_id),
    'instruments', (
      select coalesce(jsonb_agg(jsonb_build_object('slot', si.slot, 'kind', si.kind, 'ticker', si.ticker,
                                                   'sector', si.sector) order by si.slot), '[]'::jsonb)
        from public.session_instruments si where si.session_id = p_session_id),
    -- each slot's close at the end of every revealed period: what a round's
    -- decisions were made at, for holdings, concentration and the disposition
    -- measures. Never past the last revealed day.
    'period_closes', (
      select coalesce(jsonb_agg(jsonb_build_object('round', pr.round_number, 'slot', lp.slot, 'close', lp.price)
                                order by pr.round_number, lp.slot), '[]'::jsonb)
        from public.market_period_results pr
       cross join lateral public._trading_last_prices(p_session_id, v_jan1 + pr.last_game_day) lp
       where pr.session_id = p_session_id and pr.last_game_day is not null));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Helpers and triggers: nobody. Client RPCs: signed-in users (each
-- checks its own caller), added to the exact set in accounts_selftest.sql.
-- ---------------------------------------------------------------------------
revoke all on function public._trading_config_defaults()             from public, anon, authenticated;
revoke all on function public._friction_preset(text)                 from public, anon, authenticated;
revoke all on function public._friction_problems(jsonb)              from public, anon, authenticated;
revoke all on function public._friction_knobs(uuid, uuid)            from public, anon, authenticated;
revoke all on function public._research_ok(uuid, uuid)               from public, anon, authenticated;
revoke all on function public._research_players(uuid)               from public, anon, authenticated;
revoke all on function public.sessions_research_settings()           from public, anon, authenticated;
revoke all on function public.rounds_stamp_locked()                  from public, anon, authenticated;
revoke all on function public.players_assign_condition()             from public, anon, authenticated;

revoke all on function public.get_my_conditions(uuid)                from public, anon;
revoke all on function public.get_session_conditions(uuid)           from public, anon;
revoke all on function public.record_consent(uuid, boolean, text)    from public, anon;
revoke all on function public.export_research_data(uuid, text, bigint) from public, anon;
revoke all on function public.place_order(uuid, jsonb)               from public, anon;
revoke all on function public.log_behavior_events(uuid, jsonb)       from public, anon;

grant execute on function public.get_my_conditions(uuid)             to authenticated;
grant execute on function public.get_session_conditions(uuid)        to authenticated;
grant execute on function public.record_consent(uuid, boolean, text) to authenticated;
grant execute on function public.export_research_data(uuid, text, bigint) to authenticated;
grant execute on function public.place_order(uuid, jsonb)            to authenticated;
grant execute on function public.log_behavior_events(uuid, jsonb)    to authenticated;
