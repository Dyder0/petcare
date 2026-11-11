from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "role",
            "specialty",
            "is_active",
            "password",
            "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]

    def validate_password(self, value):
        validate_password(value, user=self.instance)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError(
                {"password": "La contraseña es obligatoria al crear un usuario."}
            )
        role = validated_data["role"]
        return User.objects.create_user(
            password=password, is_staff=role == User.Role.ADMIN, **validated_data
        )

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if "role" in validated_data:
            instance.is_staff = instance.role == User.Role.ADMIN
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ProfileSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=False, min_length=8, allow_blank=False
    )

    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "specialty", "password"]
        read_only_fields = ["id", "email", "role", "specialty"]

    def validate_password(self, value):
        validate_password(value, user=self.instance)
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        instance.name = validated_data.get("name", instance.name)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
