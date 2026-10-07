import * as React from "react";
import { Badge, type BadgeStatus } from "./badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

export function MetricCard({ subject, value, period }: { subject: string; value: string; period?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-caption text-muted-foreground">{subject}</p>
        <p className="mt-ds-4 text-h1">{value}</p>
        {period ? <p className="mt-ds-4 text-caption text-muted-foreground">{period}</p> : null}
      </CardContent>
    </Card>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  status,
}: {
  label: string;
  value: string;
  hint?: string;
  status?: BadgeStatus;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        {status ? <Badge status={status} /> : null}
      </CardHeader>
      <CardContent>
        <p className="text-h1">{value}</p>
        {hint ? <p className="mt-ds-4 text-caption text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function InfoCard({
  title,
  description,
  status,
  footer,
}: {
  title: string;
  description: string;
  status?: BadgeStatus;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3 text-foreground">{title}</CardTitle>
        {status ? <Badge status={status} /> : null}
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
      </CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-baseline justify-between gap-ds-12">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-h2">{value}</p>
      </CardContent>
    </Card>
  );
}
