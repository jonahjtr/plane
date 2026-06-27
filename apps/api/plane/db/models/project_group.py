# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel


class ProjectGroup(BaseModel):
    """
    A named, workspace-scoped folder for organizing Projects in the sidebar.

    DK fork feature. A Project may belong to at most one ProjectGroup
    (Project.group FK, nullable). Groups may nest exactly ONE level deep:
    a group with a non-null `parent` is a "subgroup" and may not itself be
    a parent. The 1-level rule is enforced in the serializer/view layer,
    not at the DB level.
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="project_groups",
    )
    name = models.CharField(max_length=255, verbose_name="Project Group Name")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="children",
        null=True,
        blank=True,
    )
    color = models.CharField(max_length=255, null=True, blank=True)
    logo_props = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.name} <{self.workspace.name}>"

    class Meta:
        unique_together = ["name", "parent", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "parent", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="project_group_unique_name_parent_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Group"
        verbose_name_plural = "Project Groups"
        db_table = "project_groups"
        ordering = ("sort_order", "name")

    def save(self, *args, **kwargs):
        if self._state.adding:
            last = ProjectGroup.objects.filter(
                workspace_id=self.workspace_id, parent_id=self.parent_id
            ).aggregate(largest=models.Max("sort_order"))["largest"]
            if last is not None:
                self.sort_order = last + 10000
        super().save(*args, **kwargs)
