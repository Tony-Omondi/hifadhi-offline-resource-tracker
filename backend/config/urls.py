from django.urls import path, re_path

from sync import views

urlpatterns = [
    # Exact "/health" (what the brief asks for) and "/health/" both work.
    re_path(r"^health/?$", views.health, name="health"),
    path("", views.index, name="index"),
]
