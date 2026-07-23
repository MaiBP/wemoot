"use client";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function LocationStep({ data }: { data: Record<string, string> }) {
  const [coordinates, setCoordinates] = useState({
    latitude: data.latitude || "",
    longitude: data.longitude || "",
  });
  return (
    <div>
      <h2 className="text-2xl font-bold">Ubicación habitual</h2>
      <p className="mt-2 text-brand-black/55">
        Es opcional, pero ahorra preguntas al crear eventos.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Nombre de la instalación"
          name="name"
          defaultValue={data.name}
          placeholder="Campo Municipal…"
        />
        <Field
          label="Dirección"
          name="address_line_1"
          defaultValue={data.address_line_1}
        />
        <Field label="Ciudad" name="city" defaultValue={data.city} />
        <Field label="Provincia" name="province" defaultValue={data.province} />
        <Field
          label="Código postal"
          name="postal_code"
          defaultValue={data.postal_code}
        />
        <Field
          label="País"
          name="country"
          defaultValue={data.country || "España"}
        />
        <input type="hidden" name="latitude" value={coordinates.latitude} />
        <input type="hidden" name="longitude" value={coordinates.longitude} />
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        onClick={() =>
          navigator.geolocation?.getCurrentPosition((position) =>
            setCoordinates({
              latitude: String(position.coords.latitude),
              longitude: String(position.coords.longitude),
            }),
          )
        }
      >
        <LocateFixed className="size-4" /> Usar mi ubicación actual
      </Button>
      {coordinates.latitude && (
        <p className="mt-2 text-xs text-brand-black/45">
          Coordenadas guardadas para identificar la instalación.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
