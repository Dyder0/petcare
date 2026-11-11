from django.contrib import admin

from apps.patients.models import Pet, Tutor


@admin.register(Tutor)
class TutorAdmin(admin.ModelAdmin):
    list_display = ("name", "rut", "email", "phone")
    search_fields = ("name", "rut", "email", "phone")


@admin.register(Pet)
class PetAdmin(admin.ModelAdmin):
    list_display = ("name", "species", "tutor", "record_number")
    list_filter = ("species", "sex")
    search_fields = ("name", "record_number", "tutor__name", "tutor__rut")
