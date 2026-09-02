-- A canonical journey return is a route endpoint, not an overnight stop.
-- Migration 0011 introduced normalized endpoint kinds before the durable
-- `end` role existed, so retain its existing legacy values and admit `end`
-- without manufacturing an easyt_stops foreign key.
alter table easyt_legs
  drop constraint if exists easyt_legs_to_endpoint_kind_check;

alter table easyt_legs
  add constraint easyt_legs_to_endpoint_kind_check
    check (to_endpoint_kind in ('origin', 'stop', 'end'));
