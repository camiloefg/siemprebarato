INSERT INTO admin_users (email, display_name, role, is_active)
SELECT 'camiloefg@gmail.com', 'Camilo Flores', 'super_admin', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM admin_users WHERE LOWER(email) = 'camiloefg@gmail.com'
);
