SELECT 'CREATE DATABASE cloneinsta_test OWNER cloneinsta'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'cloneinsta_test'
)\gexec
