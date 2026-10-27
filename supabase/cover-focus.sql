-- HALO — smart cover framing: focal point (0..1) used to anchor cover crops so faces stay in view.
alter table events add column if not exists cover_focus_x real;
alter table events add column if not exists cover_focus_y real;
