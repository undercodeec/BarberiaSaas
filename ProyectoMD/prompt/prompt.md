Actúa como diseñador UX/UI y desarrollador frontend senior. Replica con alta fidelidad la estructura visual y la distribución de la captura proporcionada para crear una página pública de reservas de una barbería.

IMPORTANTE:

* Usa la captura únicamente como referencia estructural.
* No copies nombres, textos, fotografías, logotipos ni datos de la empresa mostrada.
* No definas ni modifiques colores. Conserva la paleta y las variables de color existentes en el proyecto.
* No agregues degradados, efectos decorativos o estilos que no estén presentes en el sistema visual actual.
* Concéntrate en dimensiones, espacios, jerarquía, componentes, alineación y comportamiento responsive.
* No cambies la lógica existente del proyecto.
* Reutiliza componentes, estilos, iconos y utilidades ya disponibles antes de crear nuevos elementos.

La página debe construirse con enfoque mobile-first y estar optimizada principalmente para pantallas de aproximadamente 360 a 430 px de ancho.

ESTRUCTURA GENERAL

1. Encabezado visual o hero

* Debe ocupar todo el ancho disponible.
* Usar una imagen vertical o panorámica de la barbería como fondo.
* Colocar una capa de contenido superpuesta en la parte inferior.
* Mostrar el nombre principal de la barbería en tamaño destacado.
* Debajo, agregar una etiqueta con la categoría del negocio.
* Incluir dos filas pequeñas de información:

  * Dirección o ubicación.
  * Estado actual del establecimiento y horario.
* Añadir iconos junto a los datos secundarios.
* Mantener el contenido alineado hacia la izquierda.
* Procurar que la información continúe siendo legible sobre la imagen.
* La altura del hero debe adaptarse proporcionalmente al ancho móvil.

2. Navegación interna

Debajo del hero, agregar una barra horizontal con tres pestañas:

* Servicios.
* Equipo.
* Reseñas.

Requisitos:

* Distribución uniforme.
* Texto centrado.
* Indicador inferior para la pestaña activa.
* Al tocar una pestaña, desplazar suavemente la página hacia su sección.
* Mantener estados activos y de interacción accesibles.
* Puede permanecer fija temporalmente en la parte superior mientras el usuario navega por el contenido.

3. Sección “Sobre nosotros”

* Título de sección.
* Descripción breve del establecimiento.
* Espaciado compacto y alineación izquierda.
* Limitar el ancho de lectura para evitar líneas demasiado largas.

4. Servicio destacado

Agregar un bloque con:

* Título “Lo más pedido aquí”.
* Enlace secundario para consultar todos los servicios.
* Una tarjeta destacada de mayor tamaño que las tarjetas normales.

La tarjeta destacada debe contener:

* Imagen del servicio ubicada al lado izquierdo.
* Indicador pequeño de popularidad o reservas.
* Nombre del servicio.
* Duración.
* Precio claramente visible.
* Botón principal de reserva.
* Texto inferior con una métrica de demanda, por ejemplo, cantidad de clientes que reservaron recientemente.
* Iconos o avatares pequeños junto a la métrica.
* Distribución en dos columnas dentro de la tarjeta.
* En móviles muy estrechos, permitir que la información se reorganice sin desbordarse.

5. Buscador y filtros

Debajo del servicio destacado incluir:

* Campo de búsqueda de ancho completo.
* Icono de búsqueda dentro del campo.
* Texto indicativo para buscar servicios.
* Botón o selector de categoría inmediatamente debajo.
* Mostrar la categoría activa y, opcionalmente, la cantidad de resultados.
* Mantener controles compactos y fáciles de tocar.

6. Listado de servicios

Crear una lista vertical de tarjetas de servicios.

Cada tarjeta debe incluir:

* Imagen cuadrada o ligeramente vertical a la izquierda.
* Etiqueta pequeña opcional de “Popular”.
* Nombre del servicio.
* Descripción breve de una o dos líneas.
* Duración acompañada por un icono.
* Precio alineado hacia la parte superior derecha.
* Botón “Reservar” alineado hacia la parte inferior derecha.
* Separación clara entre imagen, información y acciones.

Comportamiento:

* Las tarjetas deben mantener una altura consistente cuando sea posible.
* Los nombres largos deben truncarse o limitarse a dos líneas.
* Las descripciones largas no deben alterar excesivamente la altura.
* El precio y el botón deben conservar su alineación.
* La imagen no debe deformarse; utilizar recorte proporcional.
* Agregar una separación vertical uniforme entre tarjetas.
* Generar suficientes tarjetas de ejemplo para comprobar el desplazamiento y la consistencia del diseño.

7. Sección de colaboradores

Después del listado de servicios agregar:

* Título “Colaboradores”.
* Carrusel horizontal de tarjetas.
* Cada tarjeta debe mostrar:

  * Fotografía circular del colaborador.
  * Nombre.
  * Cargo o especialidad.
  * Pequeño indicador opcional en una esquina.
* Mostrar parcialmente la siguiente tarjeta para comunicar que el contenido puede desplazarse horizontalmente.
* Permitir navegación táctil mediante gesto de arrastre.
* Evitar mostrar una barra de desplazamiento visible.

8. Resumen de valoraciones

Crear un bloque compacto con:

* Promedio general o resumen de estrellas.
* Distribución de calificaciones desde cinco hasta una estrella.
* Barra horizontal para cada nivel.
* Cantidad de reseñas alineada al extremo derecho.
* El bloque debe ser fácil de interpretar en una pantalla móvil.

9. Testimonio destacado

Agregar una tarjeta de reseña con:

* Nombre del cliente o identificador.
* Icono decorativo relacionado con reseñas.
* Texto principal del testimonio en mayor jerarquía.
* Texto secundario explicativo.
* Espaciado interno suficiente para diferenciar el contenido.

10. Información final del negocio

Crear una sección informativa antes del footer con:

* Nombre de la barbería.
* Descripción corta.
* Iconos de redes sociales.
* Bloque de navegación con enlaces a:

  * Servicios.
  * Colaboradores.
  * Reseñas.
* Bloque “Más información” con:

  * Dirección.
  * Horario o estado.
* Usar iconos junto a ubicación y horario.
* Organizar toda la información verticalmente en móviles.

11. Footer

Agregar un pie de página compacto con:

* Crédito o texto de desarrollo.
* Copyright.
* Año actual calculado dinámicamente.
* Separación visual respecto a la sección anterior.

RESPONSIVE

* El diseño debe ser mobile-first.
* En móvil, utilizar una sola columna.
* En tablet y escritorio, limitar el contenido a un contenedor central para que las tarjetas no se estiren demasiado.
* En pantallas mayores se pueden usar dos columnas para el listado de servicios, siempre que no se pierda la jerarquía de la referencia.
* El hero puede aumentar su altura en pantallas grandes.
* Evitar desplazamiento horizontal accidental.
* Todos los botones deben tener un área táctil adecuada.
* Mantener espacios laterales uniformes en toda la página.
* Respetar las áreas seguras de dispositivos móviles.

COMPONENTES RECOMENDADOS

Divide la implementación en componentes reutilizables:

* BusinessHero
* SectionNavigation
* AboutSection
* FeaturedServiceCard
* ServiceSearch
* CategoryFilter
* ServiceCard
* ServiceList
* CollaboratorCarousel
* RatingsSummary
* FeaturedReview
* BusinessInformation
* Footer

REQUISITOS DE IMPLEMENTACIÓN

* Utilizar HTML semántico.
* Mantener una jerarquía correcta de encabezados.
* Añadir textos alternativos a las imágenes.
* Incorporar etiquetas accesibles en botones, iconos y controles.
* Crear los servicios y colaboradores a partir de arreglos de datos, evitando repetir manualmente el marcado.
* Los botones de reserva deben estar preparados para conectarse posteriormente con un modal o flujo de agendamiento.
* Incluir estados hover, focus, active y disabled usando el sistema visual existente.
* Evitar valores rígidos innecesarios.
* No usar estilos inline si el proyecto ya tiene una arquitectura de estilos definida.
* No instalar nuevas dependencias salvo que sea estrictamente necesario.
* No implementar backend ni pasarela de pago en esta tarea.

RESULTADO ESPERADO

Una interfaz limpia, compacta y completamente responsive que conserve la misma composición de la captura: hero con información superpuesta, navegación por secciones, presentación del negocio, servicio destacado, buscador, filtros, catálogo vertical, colaboradores, calificaciones, testimonio, información comercial y footer.

Antes de finalizar:

* Verifica el diseño en anchos de 360, 390, 430, 768 y 1280 px.
* Comprueba que no existan elementos recortados o desbordamientos.
* Revisa que precios, botones e imágenes mantengan una alineación consistente.
* Confirma que no se hayan agregado colores nuevos ni reemplazado los existentes.
* Entrega un resumen breve de los archivos modificados y de los componentes creados.
