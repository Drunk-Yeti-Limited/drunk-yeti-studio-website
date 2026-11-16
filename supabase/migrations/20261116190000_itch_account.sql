create table public.dy_itch_pending (
  player_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null unique,
  verifier text not null,
  restore boolean not null,
  expires_at timestamptz not null
);
create table public.dy_itch_connections (
  player_id uuid primary key references auth.users(id) on delete cascade,
  itch_user_id bigint not null unique check (itch_user_id > 0),
  username text not null check (length(username) between 1 and 128)
);
-- A receipt stays with the account that first restored the purchase.
create table public.dy_itch_snowlight_receipts (
  itch_user_id bigint primary key check (itch_user_id > 0),
  player_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index dy_itch_snowlight_receipts_player on public.dy_itch_snowlight_receipts(player_id);

alter table public.dy_itch_pending enable row level security;
alter table public.dy_itch_connections enable row level security;
alter table public.dy_itch_snowlight_receipts enable row level security;
revoke all on public.dy_itch_pending, public.dy_itch_connections, public.dy_itch_snowlight_receipts
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.dy_itch_pending, public.dy_itch_connections, public.dy_itch_snowlight_receipts to service_role;

create function public.dy_itch_link(
  p_player uuid, p_itch_user bigint, p_username text, p_owns_snowlight boolean
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.dy_itch_connections (player_id, itch_user_id, username)
  values (p_player, p_itch_user, p_username)
  on conflict (player_id) do update set username = excluded.username
  where dy_itch_connections.itch_user_id = excluded.itch_user_id;
  if not found then
    raise unique_violation using message = 'disconnect_other_itch_account';
  end if;

  if p_owns_snowlight then
    insert into public.dy_itch_snowlight_receipts (itch_user_id, player_id)
    values (p_itch_user, p_player)
    on conflict (itch_user_id) do update set verified_at = now()
    where dy_itch_snowlight_receipts.player_id = excluded.player_id;
    if not found then
      raise unique_violation using message = 'purchase_already_restored';
    end if;

    insert into public.dy_entitlements (player_id, game_id, item_id)
    values (p_player, 'yeti-account', 'full-access:snowlight')
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.dy_itch_link(uuid, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.dy_itch_link(uuid, bigint, text, boolean) to service_role;

notify pgrst, 'reload schema';
