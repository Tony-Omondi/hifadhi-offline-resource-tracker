from django.urls import path, re_path

from sync import views

urlpatterns = [
    # Exact "/health" (what the brief asks for) and "/health/" both work.
    re_path(r"^health/?$", views.health, name="health"),
    path("api/sync", views.sync, name="sync"),
    path("api/records", views.records, name="records"),
    path("api/ops", views.op_log, name="op-log"),
    path("sw.js", views.service_worker, name="service-worker"),
    path("", views.index, name="index"),
]
