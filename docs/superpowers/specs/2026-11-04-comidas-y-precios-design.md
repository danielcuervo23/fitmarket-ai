# Diseño: comidas que se cumplen y precios reales (FitMarket)

Fecha: 2026-11-04 · Estado: borrador para aprobación del dueño

## 1. Intención (el porqué)

FitMarket arma un plan semanal de comidas y una lista de mercado. Hoy el plan
puede incumplir lo que el usuario pidió y los precios son en gran parte
estimados. El dueño quiere tres cosas:

1. **Que el plan siempre cumpla** las restricciones y los objetivos que el
   usuario eligió. Los objetivos se cumplen con reglas medibles, no se toman
   como sugerencias.
2. **Que los precios sean reales** en los cinco supermercados que se pueden
   elegir: D1, Ara, Éxito, Jumbo y Carulla.
3. **Que el usuario sienta que sí puede.** Recetas sencillas, rápidas y para
   gente que no sabe cocinar mucho. El usuario objetivo es joven y estudiante.
   Si siente que no podrá cumplir, abandona la app. La retención es la meta de
   fondo.

**Para qué sirve la lista de mercado:** el usuario la lleva a la tienda y va
marcando lo que mete al carrito. Los precios le sirven para saber cuánto
gastará y para no pasarse de su presupuesto. No son para comparar tiendas.

## 2. Metas, no-metas y anti-metas

**Metas**
- Cada objetivo elegido (muscle, fat, healthy, save, family, energy) se
  traduce en reglas que el servidor verifica antes de entregar el plan.
- Si no se pueden cumplir, el plan **no se entrega**. La app explica qué
  choca y qué cambiar. Un botón opcional, "Quiero el plan igual", entrega el
  mejor plan posible con un aviso claro de qué no se cumplió.
- **Las alergias, las restricciones y el presupuesto no se rompen nunca**,
  tampoco con ese botón. "Quiero el plan igual" sacrifica la meta (por
  ejemplo, "llegas al 85 % de tu proteína"), nunca el presupuesto.
- Precios por supermercado, actualizados cada semana desde fuentes oficiales y
  corregidos por los usuarios.
- Recetas con tiempo y dificultad ajustados a cada usuario. Cocinar una vez
  para varios días es una opción que el usuario puede activar.

**No-metas (por ahora)**
- Comparar precios entre tiendas como función principal.
- Rachas, recordatorios y avances para retener al usuario: van en el proyecto
  de rediseño.
- Cobro y planes de pago: proyecto posterior.

**Anti-metas** (sería un fracaso aunque "funcione")
- Planes que cumplen los números pero que nadie cocinaría.
- Recetas largas o con técnicas difíciles entre semana.
- Precios inventados presentados como reales.
- Leer las páginas de una tienda en contra de sus términos de uso.

## 3. Reglas por objetivo

Fuente: investigación del 2026-11-04 basada en las GABA y la RIEN del ICBF, la
OMS, ISSN y ACSM/AND. **[F]** = evidencia fuerte; **[P]** = criterio prudente.
Las reglas se miden por persona y día, salvo que se diga otra cosa.

**Orden de prioridad cuando hay choque:**
1. Seguridad, alergias, restricciones y **presupuesto (límite duro)**.
2. Calorías y proteína del objetivo corporal.
3. healthy y energy.
4. family.
5. save (solo optimiza, nunca hace fallar el plan por sí misma).

Se mantiene el piso actual de 40.000 COP por persona y semana: por debajo de
eso se responde de inmediato, sin llamar a la IA. El presupuesto es el total
de la casa.

**Base de todo plan**
- 0 alimentos prohibidos.
- Calorías dentro de ±10 % de la meta, cada día [P].
- Al menos 4 de los 6 grupos del plato GABA cada día [P].

**healthy**
- ≥400 g de frutas y verduras por adulto al día, sin contar papa, yuca ni
  plátano [F].
- ≥25 g de fibra [F].
- Azúcares libres <10 % de las kcal [F].
- Sodio <2000 mg [F].
- Grasa total ≤30 % y grasa saturada <10 % de las kcal [F].
- Leguminosas ≥2 veces por semana [P].
- ≥15 alimentos distintos por semana [P].

**fat**
- Déficit del 15–25 % del gasto diario (TDEE), sin bajar más de 1 % del peso
  ni más de 1 kg por semana [F/P].
- Proteína de 1,6–2,2 g/kg [F].
- Frutas, verduras y fibra iguales que en healthy.

**muscle**
- Superávit del 5–15 % [P].
- Proteína de 1,6–2,2 g/kg, nunca menos de 1,4 [F].
- ≥3 comidas con 20–40 g de proteína cada una [F].
- Carbohidratos ≥3 g/kg [F].

**fat + muscle (recomposición)**
- Calorías entre −5 % y mantenimiento; proteína de 2,0–2,4 g/kg [P].

**energy**
- Déficit máximo del 15 %, aunque también se elija fat [P].
- ≥3 comidas; ninguna con más del 40 % de las kcal del día [P].
- Desayuno con ≥15 g de proteína y ≥3 g de fibra [P].
- Fuentes de hierro ≥5 veces por semana [P].
- Azúcares libres <10 % [F].

**save**
- Minimizar el costo semanal sujeto a todo lo anterior.
- ≥50 % de la proteína debe venir de fuentes baratas (huevo, leguminosas,
  pernil, sardina) [P].

**family**
- Cada miembro tiene su propia meta según su edad (RIEN).
- Mismas preparaciones para todos, con porciones distintas.
- El objetivo corporal se aplica solo al usuario; el resto de la familia va
  en mantenimiento.
- Los menores nunca hacen déficit ni metas de músculo.

**Seguridad**
- Piso de calorías: el mayor entre la tasa basal (BMR), 1200 kcal en mujeres
  y 1500 kcal en hombres (1400 si el sexo es desconocido).
- Nunca menos de 800 kcal.
- Proteína ≤2,5 g/kg.
- Superávit ≤15 %; déficit ≤25 %.
- **Se bloquea el objetivo fat** en: menores de 18, embarazo o lactancia,
  IMC <18,5 y mayores de 65 (en estos últimos se bloquea fat y se recomienda
  un profesional).
- **Se recomienda un profesional** con: IMC ≥35, diabetes, enfermedad renal
  (además se limita la proteína alta) y trastornos de la conducta
  alimentaria.

## 4. Enfoques considerados

Metáfora: un **cocinero** (sabe qué platos son ricos) y un **contador** (cuadra
los números exactos).

- **A. Solo el cocinero, con revisor.** La IA arma el plan y el servidor
  revisa y reintenta. Es lo más barato de construir, pero falla seguido con
  reglas estrictas, gasta en IA y no garantiza el cumplimiento.
- **B. Solo el contador.** Un optimizador matemático elige alimentos y
  cantidades. Garantiza el cumplimiento y el menor precio, pero arma comidas
  sin sentido culinario.
- **C. Cocinero + contador. ELEGIDO por el dueño.** Se eligen recetas
  colombianas sencillas y un optimizador ajusta cantidades e intercambia
  ingredientes equivalentes hasta cumplir todas las reglas al menor costo. Si
  el problema es imposible, el optimizador identifica qué regla choca y
  cuánto falta. Es el que más tarda en construirse.

## 5. Decisiones del dueño

- Enfoque C.
- Si no se puede cumplir: no se entrega el plan, se explica qué cambiar y se
  ofrece "Quiero el plan igual". Las restricciones nunca se rompen.
- Orden de proyectos: este primero, luego el rediseño junto con Capacitor, y
  al final los pagos.
- **Precios:** Éxito, Carulla, Jumbo y D1 se leen de sus páginas oficiales.
  D1 tiene datos de producto con precio en `domicilios.tiendasd1.com`. Ara se
  lee de los catálogos de `aratiendas.com`. **Los usuarios reportan precios**
  al marcar la lista, de forma opcional.
- **Nuevas preguntas en el registro:**
  - condiciones de salud (casillas, con opción "Ninguna");
  - edad aproximada de cada miembro de la casa, solo si elige family;
  - tiempo para cocinar entre semana (10, 20 o 30+ min);
  - nivel de cocina ("Lo básico", "Me defiendo", "Me gusta cocinar");
  - **electrodomésticos** con casillas: Estufa, Microondas, Olla arrocera,
    Freidora de aire, Licuadora, Horno, Sandwichera, Olla a presión. Si no
    responde, se asume Estufa y Licuadora. Solo se eligen recetas que se
    pueden hacer con lo que tiene, y cada receta muestra lo que necesita;
  - **ciudad donde hace mercado**.
- **Ciudad inicial: Bucaramanga.** El dueño compra allí, sobre todo en D1, Ara
  y Jumbo. Por eso se empieza leyendo esas tiendas, más Éxito y Carulla si
  tienen precios para Bucaramanga. En otras ciudades los precios se muestran
  como "aproximados" hasta que se agreguen o hasta que los usuarios los
  corrijan.
- **Presupuesto:** límite duro, también para "Quiero el plan igual".
- **Recetas sencillas:**
  - pocos ingredientes y pasos cortos en lenguaje de estudiante;
  - ≤20 min entre semana por defecto, según el tiempo que elija el usuario;
  - lo más elaborado, solo el fin de semana;
  - cada receta muestra tiempo, dificultad y pasos;
  - se vale repetir comidas.
- **Cocinar una vez para varios días:** opción que el usuario activa si
  quiere.

## 6. Diseño (las piezas)

1. **Catálogo en base de datos.** El catálogo pasa de `catalog.ts` a tablas:
   - `foods`: nutrición por 100 g con nuevos campos (fibra, sodio, azúcares
     libres, grasa saturada, hierro, grupo GABA, si es fruta o verdura).
   - `store_products`: el producto concreto en cada tienda (nombre, tamaño del
     paquete, URL).
   - `prices`: el precio por producto y fecha, con su fuente (oficial o
     usuario).

   La nutrición sale de la TCAC 2018 del ICBF, con USDA FoodData Central
   como respaldo para azúcares. Se amplía el catálogo con alimentos
   colombianos baratos (lista en la investigación).
2. **Lectores de precios.** Un proceso semanal por tienda que respeta
   `robots.txt` y los términos de uso. Guarda el precio regular, no el de
   promoción. Si un producto no aparece, se conserva el último precio con su
   fecha. La app muestra cuándo se actualizó cada precio.
3. **Precios de usuarios.**
   - Al marcar un producto, el usuario puede escribir el precio que vio.
   - Validación: rango plausible frente al precio actual (por ejemplo, entre
     ×0,5 y ×2) y un límite de reportes por usuario y día.
   - El precio vigente es la mediana de los reportes recientes, más el
     oficial.
4. **Biblioteca de recetas.**
   - Recetas colombianas sencillas guardadas en base de datos, cada una con
     ingredientes del catálogo, tiempo, dificultad, pasos, porciones, si sirve
     para cocinar por tandas y qué ingredientes son intercambiables.
   - La IA ayuda a redactarlas y una persona las revisa antes de publicarlas.
   - Al planear, la IA elige recetas de la biblioteca (variedad y gusto), no
     las inventa.
5. **Optimizador.** Con las recetas elegidas, ajusta porciones e intercambios
   para cumplir las reglas de la sección 3 y las de tiempo y dificultad del
   usuario, minimizando el costo con los precios de sus supermercados. Si no
   hay solución, devuelve las reglas que chocan y cuánto falta (por ejemplo,
   "+8.000 COP de presupuesto" o "−0,2 g/kg de proteína"). Para "Quiero el
   plan igual", relaja solo las reglas de los niveles 2 a 5 y nunca las
   restricciones.
6. **Lista de mercado.** Agrupada por supermercado, en paquetes enteros, con
   casillas para marcar y el campo opcional de precio.
7. **Registro.** Las cuatro preguntas nuevas. Los perfiles existentes reciben
   valores por defecto prudentes y se les pide completarlos al generar su
   próximo plan.

## 7. Restricciones

- Supabase sigue siendo el backend. Las Edge Functions tienen límite de
  tiempo: la generación hoy tiene un presupuesto de 120–140 s.
- Seguridad desde el diseño: ningún secreto en el código, validar todas las
  entradas, RLS en las tablas nuevas, límite de abuso en los reportes de
  precio.
- Escalar a miles de usuarios:
  - los precios se leen una vez por semana, no por usuario;
  - catálogo y precios se cachean;
  - las consultas van paginadas.
- Compatibilidad con versiones viejas de la app, que también irán a tiendas
  móviles.
- Datos de salud: son sensibles. Guardarlos con el mínimo necesario,
  explicarlo en la política de privacidad y usarlos solo para planear.

## 8. Decisiones mías (el dueño puede corregirlas)

- **Dónde corren los lectores de precios:** un trabajo programado semanal
  (por ejemplo, GitHub Actions) que escribe en Supabase con una llave
  guardada como secreto. Las Edge Functions tienen poco tiempo y su IP
  podría ser bloqueada.
- **Supermercados en la lista:** el optimizador puede repartir la compra
  entre los supermercados que eligió el usuario. Habrá un interruptor "Solo
  un supermercado" para quien no quiera ir a varios.
- **Biblioteca de recetas** en lugar de que la IA invente platos. Así se
  pueden garantizar el tiempo y la dificultad.
- **Fases de entrega:**
  1. Catálogo y precios.
  2. Reglas y optimizador.
  3. Recetas y cocina por tandas.
  4. Preguntas del registro.
  5. Lista con reporte de precios.
- **Permiso del ICBF:** pedirlo por escrito antes de usar la TCAC
  comercialmente. Mientras llega, usar USDA, que es de dominio público. Para
  alimentos colombianos que USDA no tiene (arepa, bocadillo…), usar las
  etiquetas nutricionales públicas de los productos (por ejemplo, Open Food
  Facts, citando su licencia ODbL).
- **Sin precio oficial utilizable** (los términos de la tienda lo prohíben,
  solo hay volante de promoción o el producto no existe):
  - se usa un precio estimado marcado `estimate` y la app lo muestra como
    "aproximado";
  - en cuanto haya un precio oficial o de usuarios, lo reemplaza;
  - si los términos de una tienda prohíben leerla, no se lee; esa tienda vive
    de los reportes de usuarios y de estimados;
  - un producto que esa tienda no vende se excluye solo para esa tienda.
- **Precios por ciudad:** `prices` lleva la ciudad. Los reportes de usuarios
  se agrupan por ciudad.
- **Salud (opción prudente):** con diabetes, enfermedad renal, embarazo o
  lactancia, o trastorno de la conducta alimentaria, no se aplican fat ni
  muscle. Se da un plan de mantenimiento saludable con proteína moderada
  (≤1,2 g/kg en enfermedad renal) y el aviso "consulta a un profesional". Si
  un objetivo guardado queda bloqueado, el plan se hace en mantenimiento y
  se le explica al usuario por qué.
- **Hogar:** se cocina y se compra para todos los miembros de
  `household_size`, aunque no se elija family. Sin family, cada miembro se
  calcula como un adulto en mantenimiento. Con family, cada uno según su edad
  (RIEN).
- **Versiones viejas de la app:** hoy solo existe la web, que siempre carga
  la última versión. Desde ahora la app envía su versión al pedir un plan. Si
  una versión vieja no entiende una respuesta nueva, recibe el código de
  error actual más parecido (por ejemplo `budget_too_low`).
- **Etapas:** el optimizador (fase 2) y las recetas (fase 3) se publican
  juntos. Las fases 1, 4 y 5 pueden publicarse por separado.
- **Revisión de recetas:** las recetas viven como archivos en el repositorio
  y entran por PR. Las revisa un agente especialista y el dueño da el OK
  final a una muestra. No se construye una pantalla de administración.

## 9. Queda a criterio de quien construye

- La librería del optimizador (programación lineal o entera, compatible con
  Deno o WASM).
- El esquema exacto de las tablas y las migraciones.
- La técnica para leer cada tienda (API pública, datos estructurados o HTML).
- El número inicial de recetas: mínimo suficiente para dar variedad a cada
  combinación de restricciones frecuente.
- El diseño visual de las pantallas nuevas: se rehace en el proyecto de
  rediseño, así que aquí basta con que sea funcional y accesible.
