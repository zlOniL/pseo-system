-- Templates are independent jobs and may share a service/city while waiting.
-- Page jobs remain unique per service/city to prevent duplicate locality pages.
DROP INDEX IF EXISTS queue_service_city_type_uidx;

CREATE UNIQUE INDEX queue_service_page_city_uidx
  ON queue(service_id, city)
  WHERE job_type = 'page';
