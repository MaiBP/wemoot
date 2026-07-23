import assert from "node:assert/strict";
import test from "node:test";
import { resolveEventPermissions } from "../lib/auth/permissions.ts";
import { createCsv } from "../lib/exports/csv.ts";
import { partitionRegistrationAnswers } from "../lib/forms/partition-answers.ts";

test("only medical roles and administrators can export sensitive data", () => {
  assert.equal(resolveEventPermissions("owner").canExportMedical, true);
  assert.equal(resolveEventPermissions("admin").canExportMedical, true);
  assert.equal(resolveEventPermissions("medical_staff").canExportMedical, true);
  assert.equal(
    resolveEventPermissions("registration_manager").canExportMedical,
    false,
  );
  assert.equal(resolveEventPermissions("coach").canExportMedical, false);
  assert.equal(resolveEventPermissions("viewer").canExportMedical, false);
});

test("viewer receives aggregate access without participant access", () => {
  const permissions = resolveEventPermissions("viewer");
  assert.equal(permissions.canViewAggregateStats, true);
  assert.equal(permissions.canViewRegistrations, false);
  assert.equal(permissions.canManageEvent, false);
});

test("medical answers are separated from general answers", () => {
  const result = partitionRegistrationAnswers(
    "registration-1",
    { participant_name: "Ada", allergies: "Nueces", ignored: "value" },
    [
      {
        id: "field-1",
        field_key: "participant_name",
        registration_form_sections: { section_key: "participant" },
      },
      {
        id: "field-2",
        field_key: "allergies",
        registration_form_sections: { section_key: "medical" },
      },
    ],
  );
  assert.deepEqual(
    result.general.map((row) => row.field_key),
    ["participant_name"],
  );
  assert.deepEqual(
    result.sensitive.map((row) => row.field_key),
    ["allergies"],
  );
});

test("CSV export neutralizes spreadsheet formulas", () => {
  const csv = createCsv([
    ["Nombre", "Valor"],
    ["Ataque", '=HYPERLINK("https://example.com")'],
  ]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.doesNotMatch(csv, /,"=HYPERLINK/);
});
