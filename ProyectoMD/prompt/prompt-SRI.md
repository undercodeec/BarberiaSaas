No hubo un rediseño visual grande: se mantuvo el estilo actual y se cambió principalmente cómo cada pantalla carga
  datos para que siga siendo fluida con muchos registros.

  Cambios que podrás percibir:

   Área                                   Qué verás
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   App móvil · Clientes                   Búsqueda con pequeña espera al escribir; carga inicial más ligera; botón
                                          “Ver más clientes” cuando existan más resultados. La importación de
                                          contactos ahora se procesa por lotes, conservando el resumen de creados,
                                          duplicados y límites.
  ─────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────
   App móvil · Nueva reserva              Selector de cliente con búsqueda remota y botón “Ver más clientes”.
  ─────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────
   App móvil · Agenda                     En vista mensual, los contadores de citas por día se cargan sin descargar
                                          todas las citas del mes. Al ver todas las sedes, la agenda las consulta
                                          juntas. La actualización automática solo corre mientras esa pantalla está
                                          enfocada.
  ─────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────
   App móvil · Inventario y Caja          Inventario muestra imágenes bajo demanda; productos, movimientos y
                                          resumen cargan por separado según la pestaña. Caja usa el catálogo ligero
                                          de productos. La apariencia de tarjetas y acciones se conserva.
  ─────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────
   App móvil · Dashboard / reprogramar    Dashboard obtiene solo el resumen y la próxima cita; reprogramar usa la
                                          nueva disponibilidad, con la misma experiencia de selección de horario.
  ─────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────
   Reserva pública web                    Misma URL y diseño de landing/reserva. Fotos de negocio, servicios,
                                          profesionales y productos ahora se cargan individualmente y se cachean;
                                          la página pública se refresca cada 60 segundos en vez de recargarse por
                                          completo.
  ─────────────────────────────────────  ───────────────────────────────────────────────────────────────────────────
   Inicio, checkout y admin               Sin cambio visual intencional; solo ajustes de accesibilidad y
                                          estabilidad de React/lint. El menú de inicio ahora tiene etiqueta
                                          accesible para lector de pantalla.

  Cómo probarlo:

  1. En un ambiente de pruebas con las migraciones aplicadas, inicia API, web y móvil:

  pnpm dev:api
  pnpm dev:web
  pnpm dev:mobile

  2. En móvil, prueba con suficientes datos:

  - Clientes: busca por nombre/teléfono/correo, espera ~300 ms, y pulsa “Ver más clientes”.
  - Nueva reserva: repite búsqueda y paginación del selector.
  - Agenda: alterna día/semana/mes, selecciona “todas las sedes” si tienes permisos y cambia de pantalla para
    comprobar que no refresca en segundo plano.

  - Inventario: alterna Productos/Movimientos; comprueba imágenes, resumen y ajuste de stock.
  - Caja: crea una venta con producto y verifica que el inventario se actualice.
  - Reprogramar: abre una cita y valida que los horarios disponibles coincidan con la agenda.

  3. En web, visita la URL pública de una barbería y comprueba:

  - Portada, logo, fotos de servicios, profesionales y productos.
  - Flujo completo: elegir servicio → profesional → fecha/hora → datos → reserva.
  - Recarga la página y revisa que las imágenes sigan apareciendo correctamente.

  Un punto que te conviene evaluar con atención: agenda e inventario ya usan consultas paginadas internamente, pero
  hoy no exponen un botón/scroll de “cargar más” como sí lo hacen Clientes y Nueva reserva. Con más de 50 citas o
  productos, podrías querer que añada esa interacción visual antes de darlo por cerrado.