-- ==========================================================
-- Wappa eSIM - Seed Data para Cloudflare D1
-- ==========================================================

DELETE FROM destinations;
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-us', 'Estados Unidos', 'US', 'americas', '🇺🇸', 'Nueva York, Miami, Los Ángeles', 1, 4.5, 6, 0, NULL);
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-es', 'España', 'ES', 'europe', '🇪🇸', 'Madrid, Barcelona, Sevilla', 1, 3.9, 5, 0, NULL);
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-eu30', 'Europa (33 Países)', 'EU-33', 'europe', '🇪🇺', 'Francia, Italia, Alemania, España', 1, 5.9, 7, 1, 'Multi-país');
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-jp', 'Japón', 'JP', 'asia', '🇯🇵', 'Tokio, Kioto, Osaka', 1, 5.5, 4, 0, NULL);
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-fr', 'Francia', 'FR', 'europe', '🇫🇷', 'París, Niza, Lyon', 1, 4.2, 5, 0, NULL);
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-mx', 'México', 'MX', 'americas', '🇲🇽', 'Ciudad de México, Cancún', 1, 4.9, 4, 0, NULL);
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-ec', 'Ecuador', 'EC', 'americas', '🇪🇨', 'Quito, Guayaquil, Cuenca', 1, 6.9, 4, 0, NULL);
INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES ('dest-gl', 'Global (139 Países)', 'GL-139', 'global', '🌐', 'América, Europa, Asia', 1, 14.5, 6, 1, 'Mundial');

DELETE FROM esim_plans;
INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, duration_days, price_eur, operator, popular, best_value) VALUES ('plan-es-1gb', 'es-1gb-7d', 'España 1GB 7 Días', 'España', 'ES', 'europe', 1, 7, 3.9, 'Movistar / Orange 5G', 1, 0);
INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, duration_days, price_eur, operator, popular, best_value) VALUES ('plan-es-5gb', 'es-5gb-15d', 'España 5GB 15 Días', 'España', 'ES', 'europe', 5, 15, 8.5, 'Movistar / Vodafone 5G', 1, 0);
INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, duration_days, price_eur, operator, popular, best_value) VALUES ('plan-es-10gb', 'es-10gb-30d', 'España 10GB 30 Días', 'España', 'ES', 'europe', 10, 30, 13.9, 'Movistar / Vodafone 5G', 0, 1);
INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, duration_days, price_eur, operator, popular, best_value) VALUES ('plan-us-5gb', 'us-5gb-15d', 'USA 5GB 15 Días', 'Estados Unidos', 'US', 'americas', 5, 15, 11.5, 'AT&T / T-Mobile 5G', 1, 0);
INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, duration_days, price_eur, operator, popular, best_value) VALUES ('plan-eu-10gb', 'eu-10gb-30d', 'Europa 10GB 30 Días (33 Países)', 'Europa (33 Países)', 'EU-33', 'europe', 10, 30, 16.9, 'Redes 5G Multi-operador', 1, 1);

DELETE FROM customers;
INSERT INTO customers (id, name, email, phone, role, country, country_code) VALUES ('user-wappa-accs', 'Wappa Admin / Cuentas', 'wappaccs@gmail.com', '+593 99 111 2222', 'admin', 'Ecuador', 'EC');
INSERT INTO customers (id, name, email, phone, role, country, country_code) VALUES ('user-sofia-101', 'Sofía Valdiviezo', 'sofia.valdiviezo@wappa.com', '+593 99 876 5432', 'user', 'Ecuador', 'EC');
INSERT INTO customers (id, name, email, phone, role, country, country_code) VALUES ('user-carlos-102', 'Carlos Mendoza', 'carlos.mendoza@nomad.io', '+52 55 1234 5678', 'user', 'México', 'MX');
INSERT INTO customers (id, name, email, phone, role, country, country_code) VALUES ('user-maria-103', 'María Fernanda', 'maria.fernanda@travel.co', '+57 300 123 4567', 'user', 'Colombia', 'CO');
INSERT INTO customers (id, name, email, phone, role, country, country_code) VALUES ('user-lucas-104', 'Lucas Silva', 'lucas.silva@explorer.br', '+55 11 98765 4321', 'user', 'Brasil', 'BR');

DELETE FROM user_esims;
INSERT INTO user_esims (id, user_id, user_email, iccid, plan_id, plan_name, country, country_code, flag, operator, qr_code_url, smdp_address, activation_code, manual_code, total_data_gb, used_data_gb, price_paid, purchase_date, expiry_date, status) VALUES ('esim-active-01', 'user-sofia-101', 'sofia.valdiviezo@wappa.com', '8988228000004928172', 'plan-es-10gb', 'España 10GB 30 Días', 'España', 'ES', '🇪🇸', 'Movistar / Vodafone 5G', 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1$smdp.wappa-esim.net$ACT-ES-99281', 'smdp.wappa-esim.net', 'LPA:1$smdp.wappa-esim.net$ACT-ES-99281', 'ACT-ES-99281', 10, 3.4, 13.9, '2026-09-28', '2026-10-29', 'active');
INSERT INTO user_esims (id, user_id, user_email, iccid, plan_id, plan_name, country, country_code, flag, operator, qr_code_url, smdp_address, activation_code, manual_code, total_data_gb, used_data_gb, price_paid, purchase_date, expiry_date, status) VALUES ('esim-ready-02', 'user-sofia-101', 'sofia.valdiviezo@wappa.com', '8988228000005119283', 'plan-us-5gb', 'USA 5GB 15 Días', 'Estados Unidos', 'US', '🇺🇸', 'AT&T / T-Mobile 5G', 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1$smdp.wappa-esim.net$ACT-US-48201', 'smdp.wappa-esim.net', 'LPA:1$smdp.wappa-esim.net$ACT-US-48201', 'ACT-US-48201', 5, 0, 11.5, '2026-10-01', '2026-10-16', 'ready_to_install');
