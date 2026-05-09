from django.conf import settings
from django.contrib import admin
from django.shortcuts import render
from django.urls import include, path, re_path
from django.views.static import serve


def home(request):
    return render(request, "dashboard.html")


urlpatterns = [
    path("", home, name="home"),
    path("analysis/", home, name="analysis"),
    path("history/", home, name="history"),
    path("recommendations/", home, name="recommendations"),
    path("admin/", admin.site.urls),
    path("api/", include("diagnostics.urls")),
    path("api/", include("llm_diag.urls")),
    path("api/", include("reco.urls")),
    # Always serve uploaded media on this demo deployment. In a real
    # production setup, point /media/ at object storage (S3, Cloud Storage,
    # etc.) instead of letting Django serve files from the container.
    re_path(
        r"^media/(?P<path>.*)$",
        serve,
        {"document_root": settings.MEDIA_ROOT},
    ),
]
