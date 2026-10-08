# System Center — v3.1.1 execution 07

Date: 2026-10-08

Platform administration now opens as one System Center. Discovery, readiness, and the queue stay the modules inside it. Their routes stay available.

## System Center structure

The center is the existing route `/admin/system/readiness`. The area is the `secao` query.

Top to bottom:

1. Header: package version, environment, system status, last check, SearchApi, Google Ads, and database.
2. Tabs: Visão geral, Descoberta, Integrações, Diagnóstico, Registros, and Fila.
3. The open module.

Visão geral colors a card green, yellow, or red from the existing readiness flag, discovery health, and connection status. SearchApi is green when the key is present and yellow when it is absent. Google Ads is yellow with "Google Ads não conectado" until the existing connection check passes. The database is green when the readiness flag is ready.

The administration item Sistema points at this route. Descoberta stays its own item.

## Modules reused

Discovery dashboard, discovery health, sources, queue, and scheduler. Production readiness. Integration configuration presence. Environment issue list. Validation lab run list.

## Routes reused

- `/admin/system/readiness`
- `/admin/system/readiness?secao=visao|descoberta|integracoes|diagnostico|registros|fila`
- `/admin/discovery`
- `/admin/discovery/health`
- `/admin/discovery/sources`
- `/admin/discovery/queue`
- `/admin/discovery/scheduler`
- `/admin/validation`

## Files changed

- `src/app/admin/system/system-center.tsx`
- `src/app/admin/system/readiness/page.tsx`
- `src/components/layout/navigation.ts`
- `src/components/layout/app-layout.tsx`
- `src/app/(console)/configuracoes/page.tsx`

## UX improvements

The operator reads platform health, connections, discovery, the queue, and diagnostics from one header and one tab row. Quick links open the existing discovery screens. Secrets stay off the page. The diagnostics tab still shows the production readiness report.

## Known limitations

SearchApi quota, last request, average response time, and search events are not stored. Those fields stay unavailable or not recorded. The status is only whether the key is present.

Google Ads developer token and customer id are not shown. There is no stored sync, ad draft, or ad publish record. A disconnected account reads "Google Ads não conectado".

The last check time is the time of this page read. Discovery state is still in memory. An empty registry keeps the existing warning. The scheduler does not run jobs. Queue duration is the existing average processing time.

There is no build id and no separate log table. Registros lists environment issues, discovery health, queue failures, and validation runs. Embedded discovery and queue controls stay in English.

Checked in the browser: the center opened with SearchApi configured, Google Ads disconnected, the database ready, and the queue empty. ArrowRight moved focus from Visão geral to Descoberta. At 358px the system tabs scroll (578px). The integrations tab showed connection status only. Diagnostics showed the readiness report. Discovery, health, queue, scheduler, and sources still returned HTTP 200.
