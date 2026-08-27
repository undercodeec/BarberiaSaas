Sigue esta lista de verificación usando datos de prueba, no teléfonos reales.

  ## 1. Preparar datos

  Crea o identifica:

  - Una organización con dos sucursales: Sucursal A y Sucursal B.
  - Un usuario owner.
  - Un usuario manager.
  - Un receptionist asignado solo a Sucursal A.
  - Un barber asignado a citas específicas.
  - Clientes:
      - Cliente A con cita en Sucursal A.
      - Cliente B con cita en Sucursal B.
      - Cliente C con cita asignada al barbero.
      - Cliente D sin cita relacionada.

  Usa un teléfono de prueba reconocible, por ejemplo:

  0991234567

  ## 2. Verificar owner

  Inicia sesión como owner.

  En Clientes:

  - Debe ver todos los clientes de la organización.
  - Debe visualizar el teléfono completo.
  - Debe crear, editar y eliminar clientes.
  - Debe gestionar etiquetas.
  - Debe crear y editar notas.
  - Debe importar contactos.
  - Debe seleccionar clientes y exportar CSV.

  Al abrir el CSV, confirma que contiene los datos esperados.

  ## 3. Verificar manager

  Inicia sesión como manager.

  Confirma que puede:

  - Ver todos los clientes de la organización.
  - Ver teléfonos completos.
  - Crear, editar y eliminar clientes.
  - Gestionar etiquetas y notas.
  - Importar contactos.
  - Comunicarse desde la ficha.

  Confirma que:

  - No aparece la opción de exportar.
  - Si intenta llamar directamente al endpoint de exportación, recibe 403 Forbidden.

  ## 4. Verificar receptionist

  Inicia sesión como receptionist.

  Debe poder ver únicamente:

  - Cliente A, relacionado con Sucursal A.

  No debe ver:

  - Cliente B de Sucursal B.
  - Cliente D sin cita en su alcance.

  En la ficha de Cliente A:

  - El teléfono debe aparecer enmascarado, por ejemplo ******4567.
  - No debe aparecer el correo completo.
  - No debe aparecer dirección, documento, fecha de nacimiento, etiquetas ni notas.

  Confirma que no aparecen acciones para:

  - Crear.
  - Editar.
  - Eliminar.
  - Importar.
  - Exportar.
  - Gestionar etiquetas.
  - Gestionar notas.
  - Enviar WhatsApp o iniciar llamadas.

  ## 5. Verificar barber

  Inicia sesión como barber.

  Debe ver solamente los clientes de sus propias citas.

  Comprueba que:

  - No puede ver clientes asignados a otro barbero.
  - El teléfono aparece enmascarado.
  - No puede buscar por número telefónico.
  - No puede editar ni eliminar la ficha.
  - Puede leer sus propias notas.
  - Puede crear una nota propia.
  - No puede editar ni eliminar notas de otros colaboradores.
  - No puede exportar ni importar clientes.

  ## 6. Verificar agenda

  Para receptionist:

  - Solo debe consultar disponibilidad y citas de sus sucursales.
  - No debe poder crear una cita fuera de sus sucursales.
  - Al seleccionar un cliente, solo debe aceptar clientes dentro de su alcance.

  Para barber:

  - Solo debe consultar sus citas.
  - No debe poder acceder a citas de otros barberos.
  - No debe poder asociar clientes fuera de su alcance.

  Revisa que ninguna respuesta de agenda muestre teléfono completo o correo a roles restringidos.

  ## 7. Verificar platform admin

  Desde el panel de administración de plataforma:

  - Busca una organización.
  - Consulta sus usuarios y memberships.
  - Abre la información relacionada con clientes, si existe acceso operativo.
  - Confirma que la PII esté enmascarada.
  - Confirma que no exista acceso normal a fichas completas.
  - Confirma que no aparezcan teléfonos completos, correos completos ni exportación de clientes.

  ## 8. Verificar aislamiento entre organizaciones

  Crea un cliente en Organización A e inicia sesión con un usuario de Organización B.

  Confirma que:

  - El cliente no aparece en listados.
  - No puede abrirlo por URL directa.
  - No puede editarlo ni eliminarlo.
  - No puede asociarlo a una cita.
  - La API responde 404 o 403, según la ruta.

  ## 9. Verificar caché móvil

  1. Inicia sesión como owner.
  2. Abre una ficha con teléfono completo.
  3. Cambia el rol del usuario a receptionist.
  4. Cierra y vuelve a abrir la aplicación.
  5. Revisa la misma ficha.

  Debe mostrarse el teléfono enmascarado y no deben permanecer acciones de owner/manager.

  ## 10. Revisar auditoría

  En los logs o panel de auditoría confirma eventos como:

  client.created
  client.read
  client.note.created
  client.note.updated
  client.note.deleted
  client.export.created

  Verifica que los eventos no contengan teléfonos, correos ni otros valores PII completos.

  ## Criterio de aprobación

  La validación es satisfactoria si:

  - Owner y manager ven la ficha completa.
  - Receptionist y barber solo ven datos limitados y teléfono enmascarado.
  - Barber queda restringido a sus propias citas.
  - Receptionist queda restringido a sus sucursales.
  - Solo owner puede exportar.
  - Platform admin no accede normalmente a fichas completas.
  - Ningún usuario puede saltarse las restricciones usando una URL o petición directa.

