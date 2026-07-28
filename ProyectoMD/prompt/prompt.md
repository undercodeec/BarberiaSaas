OBJETIVO

Crear una pantalla de navegación para acceder a las estadísticas, informes e historiales del negocio.

La pantalla debe contener exactamente estas categorías:

1. Resumen de negocio.
2. Reportes de caja.
3. Reportes de ventas.
4. Otros reportes.

DISEÑO GENERAL

Utilizar:

- Fondo gris extremadamente claro.
- Tarjetas blancas.
- Bordes redondeados amplios.
- Iconos lineales azules.
- Contenedores de iconos con fondo azul muy claro.
- Títulos principales negros.
- Descripciones en gris.
- Flechas de navegación negras.
- Separación vertical amplia entre categorías.
- Diseño limpio, minimalista y profesional.
- Márgenes laterales consistentes.
- Scroll vertical.
- SafeArea para Android e iOS.

PALETA VISUAL APROXIMADA

Reutilizar los colores existentes del proyecto. Si no existen tokens equivalentes, utilizar valores aproximados:

- Fondo de pantalla: #F5F6F8
- Fondo de tarjetas: #FFFFFF
- Fondo de iconos: #EDF2FF
- Color principal azul: #356DF3
- Texto principal: #111111
- Texto secundario: #858585
- Flechas: #111111
- Borde opcional: rgba(0, 0, 0, 0.03)

No escribir los colores directamente en cada componente si el proyecto ya utiliza un archivo de tema.

1. ENCABEZADO

En la parte superior crear un encabezado fijo o sticky.

Debe permanecer visible mientras el usuario hace scroll, tal como se observa en la segunda captura.

Contenido:

- Botón de regresar en el lado izquierdo.
- Icono de flecha hacia la izquierda.
- Título: “Estadísticas e informes”.

Características:

- Fondo del mismo color que la pantalla.
- Sin sombra fuerte.
- Sin borde inferior visible, salvo que sea necesario para separar el contenido al hacer scroll.
- Flecha y título alineados verticalmente.
- El título debe utilizar peso semibold o medium.
- El botón de regresar debe tener un área táctil mínima de 44 x 44 px.
- Al presionarlo debe regresar a la pantalla anterior mediante el sistema de navegación existente.

No colocar el título centrado. Debe estar alineado hacia la izquierda, después del botón de regresar.

2. CONTENEDOR PRINCIPAL

Debajo del encabezado colocar un ScrollView o componente equivalente.

Características:

- Scroll vertical.
- Ocultar el indicador vertical si coincide con el estilo actual de la aplicación.
- Mantener padding horizontal consistente.
- Mantener una separación inferior suficiente.
- No utilizar una altura fija.
- No permitir que el contenido quede oculto debajo del encabezado.
- No agregar menú inferior.

3. SECCIÓN “RESUMEN DE NEGOCIO”

Agregar el encabezado de sección:

“Resumen de negocio”

Estilo:

- Texto negro.
- Negrita.
- Tamaño visual destacado.
- Alineado a la izquierda.
- Separación inferior antes de la tarjeta.

Debajo agregar una tarjeta:

Título:
“Resumen del negocio”

Descripción:
“Podrás ver gráficas de las ventas, gastos, ingresos.”

Icono:

- Icono lineal de gráfica de barras.
- Color azul.
- Colocado dentro de un contenedor cuadrado azul muy claro.
- Contenedor con bordes redondeados.

En el extremo derecho mostrar:

- Flecha chevron hacia la derecha.
- Color negro.
- Centrada verticalmente.

Toda la tarjeta debe ser presionable.

Al presionarla debe navegar a la pantalla del resumen general del negocio.

Ruta sugerida:

- BusinessSummary
- BusinessReports
- StatisticsOverview

Utilizar el nombre real de la ruta existente en el proyecto.

4. SECCIÓN “REPORTES DE CAJA”

Agregar el encabezado:

“Reportes de caja”

Debajo mostrar las siguientes tarjetas exactamente en este orden.

4.1 HISTORIAL DE CAJA

Título:
“Historial de caja”

Descripción:
“Podrás ver historial de caja filtrando por fechas que desees.”

Icono:

- Caja registradora.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al historial de cajas.
- Permitir posteriormente consultar aperturas, cierres, saldos y diferencias por fechas.

4.2 HISTORIAL DE GASTOS

Título:
“Historial de gastos”

Descripción:
“Podrás ver historial de gastos filtrando por fechas que desees.”

Icono:

- Flecha o gráfica descendente.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al historial de gastos.
- Permitir posteriormente filtrar por rango de fechas.

4.3 HISTORIAL DE DEPÓSITOS

Título:
“Historial de depósitos”

Descripción:
“Podrás ver historial de depósitos filtrando por fechas que desees.”

Icono:

- Flecha o gráfica ascendente.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al historial de depósitos.
- Permitir posteriormente filtrar por rango de fechas.

4.4 PAGAR A COLABORADORES

Título:
“Pagar a colaboradores”

Descripción:
“Pagar a tus colaboradores por rango de fechas.”

Icono:

- Monedas apiladas.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al módulo para calcular y registrar pagos a colaboradores.
- No realizar ningún pago directamente desde esta tarjeta.

4.5 HISTORIAL DE PAGOS A COLABORADORES

Título:
“Historial de pagos a colaboradores”

Descripción:
“Podrás ver historial de los pagos realizados a tus colaboradores filtrando por fechas que desees.”

Icono:

- Recibo o documento.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al historial de pagos a colaboradores.

La descripción puede ocupar tres líneas en pantallas pequeñas.

La tarjeta debe crecer verticalmente según el contenido. No usar una altura fija que corte el texto.

4.6 ALERTA DE INVENTARIO

Título:
“Alerta de inventario”

Descripción:
“Descubre los productos que están agotados.”

Icono:

- Escudo con símbolo de advertencia.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al listado de productos agotados o con bajo inventario.

5. SECCIÓN “REPORTES DE VENTAS”

Después de “Alerta de inventario”, agregar una separación vertical amplia.

Agregar el encabezado:

“Reportes de ventas”

Debajo mostrar las siguientes tarjetas.

5.1 HISTORIAL DE VENTAS

Título:
“Historial de ventas”

Descripción:
“Podrás ver historial de las ventas filtrando por fechas que desees.”

Icono:

- Etiqueta de precio.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al historial de ventas.
- Permitir posteriormente filtrar por fechas.

5.2 PRÉSTAMOS A CLIENTES

Título:
“Préstamos a clientes”

Descripción:
“Visualiza el estado de préstamo de tus clientes”

Icono:

- Billete o dinero sobre una mano.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al módulo de préstamos o saldos pendientes de clientes.

6. SECCIÓN “OTROS REPORTES”

Agregar una separación vertical amplia.

Mostrar el encabezado:

“Otros reportes”

Debajo agregar una tarjeta.

6.1 RESEÑAS DE TUS CLIENTES

Título:
“Reseñas de tus clientes”

Descripción:
“Vea las opiniones de sus clientes”

Icono:

- Estrella.
- Diseño lineal azul.
- Contenedor azul claro.

Acción:

- Navegar al módulo de reseñas y opiniones de clientes.

7. DISEÑO DE LAS TARJETAS

Todas las tarjetas deben utilizar el mismo componente reutilizable.

Estructura horizontal:

- Contenedor del icono a la izquierda.
- Bloque de textos en el centro.
- Flecha chevron a la derecha.

Características:

- Fondo blanco.
- Ancho completo disponible.
- Bordes redondeados de aproximadamente 20 a 24 px.
- Padding interno entre 16 y 20 px.
- Separación entre tarjetas de aproximadamente 16 a 20 px.
- Sin sombras fuertes.
- Borde muy sutil opcional.
- Altura dinámica.
- Toda la superficie debe ser presionable.
- Feedback visual al presionar.
- No permitir que el contenido se desborde.
- No permitir que la flecha se desplace fuera de la tarjeta.

Distribución sugerida:

- Contenedor del icono: entre 56 y 64 px.
- Separación entre icono y texto: entre 12 y 16 px.
- Flecha: área táctil mínima de 44 x 44 px.
- Contenido textual: flex: 1.

El contenedor del icono debe tener:

- Forma cuadrada.
- Bordes redondeados.
- Fondo azul muy claro.
- Icono centrado.
- Tamaño uniforme en todas las tarjetas.

8. TIPOGRAFÍA

Título de la pantalla:

- Peso medium o semibold.
- Tamaño aproximado entre 26 y 30 px.

Encabezados de sección:

- Peso bold.
- Tamaño aproximado entre 26 y 30 px.
- Color negro.

Título de tarjeta:

- Peso medium o semibold.
- Tamaño aproximado entre 18 y 21 px.
- Color negro.
- Máximo de dos líneas cuando sea necesario.

Descripción:

- Peso regular.
- Tamaño aproximado entre 16 y 19 px.
- Color gris.
- Altura de línea cómoda.
- Permitir varias líneas.

Utilizar la tipografía real configurada en el proyecto.

9. ORDEN EXACTO DEL CONTENIDO

La pantalla debe mostrar exactamente este orden:

Estadísticas e informes

Resumen de negocio
- Resumen del negocio

Reportes de caja
- Historial de caja
- Historial de gastos
- Historial de depósitos
- Pagar a colaboradores
- Historial de pagos a colaboradores
- Alerta de inventario

Reportes de ventas
- Historial de ventas
- Préstamos a clientes

Otros reportes
- Reseñas de tus clientes

No cambiar el orden.

No mover “Alerta de inventario” a otra categoría.

10. SCROLL Y ENCABEZADO STICKY

La pantalla debe reproducir el comportamiento mostrado en las capturas:

- Al iniciar, se observa el encabezado y las primeras categorías.
- Al desplazarse hacia abajo, el encabezado “Estadísticas e informes” permanece visible.
- El contenido pasa por debajo del encabezado.
- No debe existir un salto visual al activar el encabezado fijo.
- El fondo del encabezado debe impedir que el contenido se vea superpuesto detrás del texto.
- Respetar la SafeArea superior.

11. NAVEGACIÓN

Crear una configuración central para las opciones del menú, evitando escribir manualmente cada tarjeta por separado.

Ejemplo de estructura:

type ReportMenuItem = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  route: string;
  permission?: string;
};

type ReportSection = {
  id: string;
  title: string;
  items: ReportMenuItem[];
};

Renderizar las categorías mediante map o el mecanismo equivalente del framework.

Cada opción debe:

- Navegar a su ruta correspondiente.
- Mostrar feedback al presionar.
- Evitar múltiples navegaciones por doble toque.
- Verificar permisos antes de abrir la ruta cuando corresponda.

12. PERMISOS

La visibilidad de ciertas opciones puede depender del rol del usuario.

Considerar permisos para:

- Consultar estadísticas.
- Consultar caja.
- Consultar gastos.
- Consultar depósitos.
- Pagar colaboradores.
- Consultar pagos de colaboradores.
- Consultar inventario.
- Consultar ventas.
- Consultar préstamos.
- Consultar reseñas.

No mostrar una opción cuando el usuario no tenga permiso, salvo que la arquitectura actual prefiera mostrarla deshabilitada.

La decisión debe seguir el patrón ya existente en el proyecto.

13. ESTADOS DE LA PANTALLA

Implementar:

Estado normal:
- Mostrar todas las opciones permitidas.

Estado cargando permisos:
- Mostrar skeletons o placeholders discretos.
- Evitar que las tarjetas aparezcan y desaparezcan bruscamente.

Estado sin permisos:
- Mostrar un estado vacío amigable.
- Texto sugerido:
  “No tienes permisos para consultar estos reportes.”

Estado de error:
- Mostrar:
  “No pudimos cargar los reportes.”
- Agregar botón:
  “Intentar nuevamente”

Ruta no disponible:
- Mostrar un mensaje temporal:
  “Esta sección estará disponible próximamente.”
- No cerrar ni romper la aplicación.

14. ACCESIBILIDAD

- Agregar accessibilityLabel a todos los botones.
- Cada tarjeta debe anunciar su título y descripción.
- La flecha no debe ser el único elemento presionable.
- Toda la tarjeta debe ser accesible como botón.
- Mantener áreas táctiles mínimas de 44 x 44 px.
- Garantizar contraste suficiente.
- Permitir escalado del texto.
- No cortar contenido cuando el usuario utilice texto grande.
- Marcar los encabezados de sección con el rol semántico correspondiente cuando el framework lo permita.

15. RESPONSIVE

- Adaptar correctamente la pantalla a Android e iOS.
- Usar SafeArea.
- No fijar la altura de las tarjetas.
- Permitir que las descripciones ocupen varias líneas.
- Mantener márgenes laterales en pantallas pequeñas.
- Limitar el ancho del contenido en tablets y centrarlo.
- Evitar tarjetas excesivamente anchas en tablets.
- No mostrar scroll horizontal.
- No agregar navegación inferior.
- Agregar suficiente padding inferior para que la última tarjeta pueda verse completamente.

16. COMPONENTES SUGERIDOS

Separar la implementación en componentes reutilizables:

- ReportsScreen
- ReportsHeader
- ReportsSection
- ReportNavigationCard
- ReportIconContainer
- ReportsLoadingSkeleton
- ReportsEmptyState
- ReportsErrorState

Ejemplo conceptual:

<ReportsScreen>
  <ReportsHeader />

  <ScrollView>
    <ReportsSection title="Resumen de negocio">
      <ReportNavigationCard />
    </ReportsSection>

    <ReportsSection title="Reportes de caja">
      <ReportNavigationCard />
      <ReportNavigationCard />
    </ReportsSection>
  </ScrollView>
</ReportsScreen>

17. DATOS DE CONFIGURACIÓN

Crear una colección para las categorías y opciones.

Ejemplo:

const reportSections = [
  {
    id: 'business-summary',
    title: 'Resumen de negocio',
    items: [
      {
        id: 'business-overview',
        title: 'Resumen del negocio',
        description:
          'Podrás ver gráficas de las ventas, gastos, ingresos.',
        icon: 'bar-chart',
        route: 'BusinessSummary',
      },
    ],
  },
  {
    id: 'cash-reports',
    title: 'Reportes de caja',
    items: [
      {
        id: 'cash-history',
        title: 'Historial de caja',
        description:
          'Podrás ver historial de caja filtrando por fechas que desees.',
        icon: 'cash-register',
        route: 'CashHistory',
      },
      {
        id: 'expense-history',
        title: 'Historial de gastos',
        description:
          'Podrás ver historial de gastos filtrando por fechas que desees.',
        icon: 'trending-down',
        route: 'ExpenseHistory',
      },
      {
        id: 'deposit-history',
        title: 'Historial de depósitos',
        description:
          'Podrás ver historial de depósitos filtrando por fechas que desees.',
        icon: 'trending-up',
        route: 'DepositHistory',
      },
      {
        id: 'pay-collaborators',
        title: 'Pagar a colaboradores',
        description:
          'Pagar a tus colaboradores por rango de fechas.',
        icon: 'coins',
        route: 'PayCollaborators',
      },
      {
        id: 'collaborator-payment-history',
        title: 'Historial de pagos a colaboradores',
        description:
          'Podrás ver historial de los pagos realizados a tus colaboradores filtrando por fechas que desees.',
        icon: 'receipt',
        route: 'CollaboratorPaymentHistory',
      },
      {
        id: 'inventory-alert',
        title: 'Alerta de inventario',
        description:
          'Descubre los productos que están agotados.',
        icon: 'shield-alert',
        route: 'InventoryAlerts',
      },
    ],
  },
  {
    id: 'sales-reports',
    title: 'Reportes de ventas',
    items: [
      {
        id: 'sales-history',
        title: 'Historial de ventas',
        description:
          'Podrás ver historial de las ventas filtrando por fechas que desees.',
        icon: 'tag',
        route: 'SalesHistory',
      },
      {
        id: 'customer-loans',
        title: 'Préstamos a clientes',
        description:
          'Visualiza el estado de préstamo de tus clientes',
        icon: 'hand-money',
        route: 'CustomerLoans',
      },
    ],
  },
  {
    id: 'other-reports',
    title: 'Otros reportes',
    items: [
      {
        id: 'customer-reviews',
        title: 'Reseñas de tus clientes',
        description:
          'Vea las opiniones de sus clientes',
        icon: 'star',
        route: 'CustomerReviews',
      },
    ],
  },
];

Adaptar los nombres de iconos y rutas a los disponibles en el proyecto.

18. CRITERIOS DE ACEPTACIÓN

- La pantalla replica visualmente las capturas proporcionadas.
- El encabezado permanece visible durante el scroll.
- El botón de regresar funciona correctamente.
- El fondo de la pantalla es gris muy claro.
- Las tarjetas son blancas y tienen bordes redondeados.
- Todos los iconos aparecen dentro de contenedores azul claro.
- Todas las tarjetas muestran una flecha a la derecha.
- Se respeta exactamente el orden de secciones y opciones.
- Los textos coinciden con la referencia.
- La pantalla no tiene menú inferior.
- La pantalla no tiene botón flotante.
- La lista puede desplazarse verticalmente.
- Las descripciones no se cortan.
- Las tarjetas se adaptan al tamaño de su contenido.
- Todas las tarjetas son presionables.
- Las rutas inexistentes no rompen la aplicación.
- La interfaz funciona correctamente en Android e iOS.
- Se utiliza TypeScript.
- Se reutilizan los componentes y tokens visuales existentes.
- No se modifican pantallas no relacionadas.