process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://laundry_dev:laundry_dev_local_only@localhost:5432/laundry_test?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test_only_access_secret_do_not_use_in_prod";
process.env.JWT_REFRESH_SECRET ??= "test_only_refresh_secret_do_not_use_in_prod";

process.env.WHATSAPP_VERIFY_TOKEN ??= "test_whatsapp_verify_token";
process.env.WHATSAPP_APP_SECRET ??= "test_whatsapp_app_secret_for_webhook_tests";
