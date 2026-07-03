INSERT OR IGNORE INTO organizations (id, name, slug)
VALUES ('org_flam', 'FLAM', 'flam');

INSERT OR IGNORE INTO events (id, organization_id, name, slug, pin_code)
VALUES ('event_flam_pomar_2026', 'org_flam', 'Pomar 2026', 'flam-pomar-2026', '2468');

INSERT OR IGNORE INTO event_branding (event_id, logo_url, accent_color, welcome_text)
VALUES (
  'event_flam_pomar_2026',
  '',
  '#E2712A',
  'Bem-vindo ao estande da FLAM! Teste seus conhecimentos biblicos e concorra a um brinde.'
);

INSERT OR IGNORE INTO registration_fields (id, event_id, field_key, label, field_type, required, enabled, sort_order)
VALUES
  ('field_name', 'event_flam_pomar_2026', 'full_name', 'Nome completo', 'text', 1, 1, 10),
  ('field_phone', 'event_flam_pomar_2026', 'phone', 'Telefone', 'tel', 1, 1, 20),
  ('field_church', 'event_flam_pomar_2026', 'church', 'Igreja que frequenta', 'text', 0, 1, 30),
  ('field_theology', 'event_flam_pomar_2026', 'theology_interest', 'Ja pensou em estudar teologia?', 'text', 0, 1, 40),
  ('field_source', 'event_flam_pomar_2026', 'source', 'Como conheceu a FLAM?', 'text', 0, 0, 50);
