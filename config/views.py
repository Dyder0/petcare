from django.conf import settings
from django.http import FileResponse


def home(request):
    return FileResponse(
        (settings.BASE_DIR / "index.html").open("rb"),
        content_type="text/html; charset=utf-8",
    )
