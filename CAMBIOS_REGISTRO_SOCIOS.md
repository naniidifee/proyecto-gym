# Cambios: registro de socios (CU08)

## Qué se cambió
- **Perfil Recepción → Registrar socio**: ya no se escribe un identificador manual; el campo indica que se asignará automáticamente.
- El formulario incorpora una **contraseña inicial** que debe incluir mayúscula, minúscula y número, con un mínimo de 8 caracteres.
- El botón ahora registra la ficha **y** crea la cuenta de acceso Supabase Auth en el mismo flujo.
- **Perfil Recepción → Cuenta del socio**: muestra el código y la cuenta creada; conserva invitación solo para fichas antiguas sin acceso.
- **Administrador → Gestión de personal**: sin cambios. Sigue creando recepcionistas desde el panel.

## Qué archivo SQL debes ejecutar en tu Supabase ACTUAL

1. En Supabase → SQL Editor → New query: pega **todo** `supabase/06_registro_socios_automatico.sql` y pulsa Run. **No borres los datos actuales**.
2. En otra consulta, pega **todo** `supabase/02_pages.sql` y pulsa Run.
3. En otra consulta, pega **todo** `supabase/03_actions.sql` y pulsa Run.
4. Reinicia Vite (`npm run dev`) y entra como recepción a `/members/new`.

Si es un proyecto nuevo, basta con `01_schema.sql` + `02_pages.sql` + `03_actions.sql` (la secuencia ya viene en 01).

## Para actualizar la carpeta local sin perder la configuración

- Descomprime el ZIP nuevo en una carpeta diferente o haz una copia de seguridad antes de sustituirlo.
- Conserva y copia **tu propio** `.env.local` de la instalación anterior: por seguridad no se incluye en este ZIP.
- Ejecuta `npm install` (el ZIP no trae `node_modules`) y después `npm run dev`.

## Ejemplo de resultado

Tras crear un socio, deberías ver: `Socio registrado con código GYM-0008 y cuenta activa.`. El número final dependerá de los socios existentes.

## Qué NO hace

- No crea ni cobra una membresía automáticamente (CU01 y CU09 siguen separados).
- No muestra ni guarda la contraseña en PostgreSQL: Supabase Auth la administra.
- No prueba por sí solo el acceso en una instancia real: valida iniciando sesión en una ventana privada después de crear un usuario de demostración.

Para uso real deben verificarse los correos y añadirse medidas de recuperación/cambio obligatorio de contraseñas, pruebas de integración y respaldo.
