from datetime import time

from django.db import migrations


def create_initial_schedule(apps, schema_editor):
    database = schema_editor.connection.alias
    clinic_settings = apps.get_model("appointments", "ClinicSettings")
    schedule_day = apps.get_model("appointments", "ScheduleDay")

    clinic_settings.objects.using(database).get_or_create(
        pk=1,
        defaults={"clinic_name": "PetCare Providencia", "slot_minutes": 30},
    )
    weekdays = []
    for day in range(7):
        if day == 0:
            values = {
                "active": False,
                "opening_time": time(9),
                "closing_time": time(13),
                "break_start": None,
                "break_end": None,
            }
        elif day == 6:
            values = {
                "active": True,
                "opening_time": time(9),
                "closing_time": time(13),
                "break_start": None,
                "break_end": None,
            }
        else:
            values = {
                "active": True,
                "opening_time": time(9),
                "closing_time": time(17, 30),
                "break_start": time(13),
                "break_end": time(15),
            }
        weekdays.append(schedule_day(day_of_week=day, **values))
    schedule_day.objects.using(database).bulk_create(weekdays)


def remove_initial_schedule(apps, schema_editor):
    database = schema_editor.connection.alias
    schedule_day = apps.get_model("appointments", "ScheduleDay")
    clinic_settings = apps.get_model("appointments", "ClinicSettings")
    schedule_day.objects.using(database).all().delete()
    clinic_settings.objects.using(database).filter(pk=1).delete()


class Migration(migrations.Migration):
    dependencies = [("appointments", "0001_initial")]

    operations = [
        migrations.RunPython(create_initial_schedule, remove_initial_schedule),
    ]
