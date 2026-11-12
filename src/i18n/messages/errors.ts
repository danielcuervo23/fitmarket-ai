import { defineMessages } from "../define.ts";

export const errors = defineMessages({
  es: {
    "errors.save": "No pudimos guardar tus cambios. Intenta de nuevo en unos segundos.",
    "errors.load": "No pudimos cargar tus datos. Intenta de nuevo en unos segundos.",
    "errors.invalidValues":
      "Algunos valores no son válidos. Revísalos e intenta de nuevo.",
    "errors.dbNotConfigured":
      "Falta configurar la base de datos. Aplica las migraciones de Supabase e intenta de nuevo.",
    "errors.sessionNotReady":
      "Tu sesión no está lista. Cierra sesión, vuelve a entrar e intenta de nuevo.",
    "errors.profileFirst": "Completa tu perfil primero.",
    "errors.budgetInvalid": "Ingresa un presupuesto válido mayor a cero.",
    "errors.goalsRequired": "Selecciona al menos un objetivo.",
    "errors.storesRequired": "Selecciona al menos un supermercado.",
    "errors.planInvalid": "El plan guardado no tiene un formato válido.",
    "errors.planNotFound": "No encontramos este plan.",
    "errors.signOut": "No pudimos cerrar sesión. Intenta de nuevo.",

    "auth.error.invalidCredentials": "Correo o contraseña incorrectos.",
    "auth.error.emailNotConfirmed":
      "Confirma tu correo antes de iniciar sesión.",
    "auth.error.rateLimit":
      "Demasiados intentos. Espera un momento e intenta de nuevo.",
    "auth.error.signInFailed":
      "No pudimos iniciar sesión. Revisa tus datos e intenta de nuevo.",
    "auth.error.emailRequired": "Ingresa tu correo electrónico.",
    "auth.error.emailInvalid": "Ingresa un correo electrónico válido.",
    "auth.error.passwordRequired": "Ingresa una contraseña.",
    "auth.error.passwordTooShort":
      "La contraseña debe tener al menos 8 caracteres.",
    "auth.error.emailTaken": "Este correo ya está registrado. Inicia sesión.",
    "auth.error.signUpFailed":
      "No pudimos crear tu cuenta. Revisa tus datos e intenta de nuevo.",
    "auth.error.confirmEmail":
      "Revisa tu correo y confirma tu cuenta. Luego inicia sesión para continuar.",
    "auth.error.passwordMismatch": "Las contraseñas no coinciden.",
    "auth.error.samePassword":
      "La nueva contraseña debe ser distinta de la anterior.",
    "auth.error.passwordWeak":
      "Esa contraseña es muy débil. Usa una más larga o mezcla letras, números y símbolos.",
    "auth.error.resetLinkInvalid":
      "Este enlace venció o ya se usó. Pide uno nuevo para cambiar tu contraseña.",
    "auth.error.passwordUpdateFailed":
      "No pudimos guardar tu nueva contraseña. Intenta de nuevo en unos segundos.",

    "gen.error.serverConfig":
      "El servicio de generación no está disponible ahora. Intenta más tarde.",
    "gen.error.loadFailed":
      "No pudimos leer tu configuración. Intenta de nuevo en unos segundos.",
    "gen.error.profileIncomplete":
      "Completa tu perfil (edad, peso, altura y actividad) antes de generar tu plan.",
    "gen.error.budgetMissing":
      "Configura un presupuesto semanal mayor a cero antes de generar tu plan.",
    "gen.error.goalsMissing":
      "Selecciona al menos un objetivo antes de generar tu plan.",
    "gen.error.storesMissing":
      "Selecciona al menos un supermercado antes de generar tu plan.",
    "gen.error.quotaExceeded":
      "Alcanzaste el límite diario de planes generados. Intenta de nuevo mañana.",
    "gen.error.rateLimited":
      "Demasiadas solicitudes. Espera un momento e intenta de nuevo.",
    "gen.error.aiUnavailable":
      "No pudimos generar tu plan. Intenta de nuevo en unos segundos.",
    "gen.error.aiTimeout": "La generación tardó demasiado. Intenta de nuevo.",
    "gen.error.invalidFormat":
      "El asistente envió un plan incompleto. Casi siempre funciona al intentarlo de nuevo.",
    "gen.error.restrictionsTooStrict":
      "Tus restricciones dejan muy pocos alimentos disponibles. Quita alguna para poder armar un plan variado.",
    "gen.error.invalidStore":
      "El plan incluía una tienda que no elegiste. Intenta de nuevo.",
    "gen.error.dietaryViolation":
      "El plan incluía alimentos prohibidos por tus restricciones. Intenta de nuevo.",
    "gen.error.portionsInvalid":
      "El plan no detallaba bien las cantidades. Intenta de nuevo.",
    "gen.error.goalIncoherent":
      "El plan no cumplía tus objetivos. Puedes intentarlo de nuevo; cada intento cuenta para tu límite diario.",
    "gen.error.budgetTooLow":
      "No fue posible generar un plan con tu presupuesto actual.",
    "gen.error.failed":
      "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.",

    // "No se puede cumplir" (Plan 2, Task 15). Numbers come from the server;
    // the words never promise to relax restrictions, safety or the budget.
    "gen.unreachable.title": "Así como está, tu plan no cumple todas tus metas",
    "gen.unreachable.intro":
      "Puedes subir tu presupuesto o pedir el mejor plan posible así como está.",
    "gen.unreachable.introBudget": "Para lograrlo, puedes subir tu presupuesto.",
    "gen.unreachable.introForce": "Puedes pedir el mejor plan posible así como está.",
    "gen.unreachable.introAdjust": "Puedes cambiar tu configuración e intentarlo de nuevo.",
    "gen.unreachable.optionsHeading": "Lo que puedes hacer:",
    "gen.unreachable.listHeading": "Esto es lo que no se alcanza:",
    "gen.unreachable.budget": "Subir tu presupuesto en {amount}",
    "gen.unreachable.changeBudget": "Cambiar mi presupuesto",
    "gen.unreachable.force": "Quiero el plan igual",
    // TODO(Task 13): once the server reuses the first attempt, say here that
    // this does not use another daily try.
    "gen.unreachable.forceHelp":
      "Te damos el mejor plan posible sin pasarte de tu presupuesto ni romper tus restricciones, y te decimos qué no se cumple.",
    "gen.conflict.generic": "Una de tus metas no se alcanza del todo",
    "gen.conflict.kcal_safety": "Calorías seguras: llegas a {achieved} de {target} al día",
    "gen.conflict.kcal_safety.over":
      "Calorías seguras: tienes {achieved} al día y lo seguro para ti es hasta {target}",
    "gen.conflict.protein_safety_max":
      "Límite seguro de proteína: tienes {achieved} g por kilo y el límite es {target}",
    "gen.conflict.protein_muscle_floor":
      "Proteína para ganar músculo: llegas a {achieved} de {target} g por kilo al día. Prueba subir tu presupuesto o escoger más comidas con pollo, huevo, atún o lentejas.",
    "gen.conflict.kcal_range": "Calorías: llegas a {achieved} de {target} al día",
    "gen.conflict.kcal_range.over":
      "Calorías: tienes {achieved} al día y lo máximo que buscamos es {target}",
    "gen.conflict.protein_min":
      "Proteína: llegas a {achieved} de {target} g por kilo al día. Prueba subir tu presupuesto o escoger más comidas con pollo, huevo, atún o lentejas.",
    "gen.conflict.protein_max":
      "Máximo de proteína: tienes {achieved} g por kilo y el máximo es {target}",
    "gen.conflict.carbs_min_muscle":
      "Carbohidratos (arroz, papa, pan): llegas a {achieved} de {target} g por kilo al día",
    "gen.conflict.meal_protein_muscle":
      "Proteína en cada comida: alguna comida llega a {achieved} de {target} g",
    "gen.conflict.meal_protein_muscle.over":
      "Proteína en cada comida: alguna comida tiene {achieved} g y lo máximo que buscamos es {target} g",
    "gen.conflict.fruit_veg_min": "Frutas y verduras: llegas a {achieved} de {target} g al día",
    "gen.conflict.fiber_min": "Fibra: llegas a {achieved} de {target} g al día",
    "gen.conflict.free_sugar_max":
      "Azúcar añadida: es el {achieved} % de tus calorías y lo recomendado es menos del {target} %",
    "gen.conflict.sodium_max":
      "Sal: tienes {achieved} mg al día y lo recomendado es menos de {target} mg",
    "gen.conflict.fat_max":
      "Grasa: es el {achieved} % de tus calorías y lo recomendado es hasta el {target} %",
    "gen.conflict.sat_fat_max":
      "Grasa saturada (como la de la mantequilla): es el {achieved} % de tus calorías y lo recomendado es menos del {target} %",
    "gen.conflict.legumes_week":
      "Comidas con lentejas, fríjol o garbanzo: llegas a {achieved} de {target} a la semana",
    "gen.conflict.distinct_foods_week":
      "Variedad: llegas a {achieved} de {target} alimentos distintos a la semana",
    "gen.conflict.gaba_groups_day":
      "Grupos de alimentos: algún día llegas a {achieved} de {target}",
    "gen.conflict.meal_kcal_share_max":
      "Calorías por comida: alguna comida tiene el {achieved} % de las calorías del día y lo recomendado es hasta el {target} %",
    "gen.conflict.breakfast_protein_min":
      "Proteína del desayuno: llegas a {achieved} de {target} g",
    "gen.conflict.breakfast_fiber_min": "Fibra del desayuno: llegas a {achieved} de {target} g",
    "gen.conflict.iron_sources_week":
      "Comidas con hierro: llegas a {achieved} de {target} a la semana",
    "gen.conflict.cheap_protein_share":
      "Proteína económica (huevo, lentejas, pollo): llegas al {achieved} % de tu proteína; buscamos el {target} %",
  },
  en: {
    "errors.save": "We couldn't save your changes. Please try again in a few seconds.",
    "errors.load": "We couldn't load your data. Please try again in a few seconds.",
    "errors.invalidValues":
      "Some values aren't valid. Review them and try again.",
    "errors.dbNotConfigured":
      "The database isn't set up yet. Apply the Supabase migrations and try again.",
    "errors.sessionNotReady":
      "Your session isn't ready. Sign out, sign back in and try again.",
    "errors.profileFirst": "Complete your profile first.",
    "errors.budgetInvalid": "Enter a valid budget greater than zero.",
    "errors.goalsRequired": "Select at least one goal.",
    "errors.storesRequired": "Select at least one supermarket.",
    "errors.planInvalid": "The saved plan has an invalid format.",
    "errors.planNotFound": "We couldn't find this plan.",
    "errors.signOut": "We couldn't sign you out. Please try again.",

    "auth.error.invalidCredentials": "Incorrect email or password.",
    "auth.error.emailNotConfirmed": "Confirm your email before signing in.",
    "auth.error.rateLimit": "Too many attempts. Wait a moment and try again.",
    "auth.error.signInFailed":
      "We couldn't sign you in. Check your details and try again.",
    "auth.error.emailRequired": "Enter your email address.",
    "auth.error.emailInvalid": "Enter a valid email address.",
    "auth.error.passwordRequired": "Enter a password.",
    "auth.error.passwordTooShort": "Your password must be at least 8 characters.",
    "auth.error.emailTaken": "This email is already registered. Sign in instead.",
    "auth.error.signUpFailed":
      "We couldn't create your account. Check your details and try again.",
    "auth.error.confirmEmail":
      "Check your email and confirm your account, then sign in to continue.",
    "auth.error.passwordMismatch": "The passwords don't match.",
    "auth.error.samePassword":
      "Your new password must be different from the old one.",
    "auth.error.passwordWeak":
      "That password is too weak. Make it longer or mix letters, numbers and symbols.",
    "auth.error.resetLinkInvalid":
      "This link has expired or was already used. Request a new one to change your password.",
    "auth.error.passwordUpdateFailed":
      "We couldn't save your new password. Try again in a few seconds.",

    "gen.error.serverConfig":
      "The generation service isn't available right now. Please try later.",
    "gen.error.loadFailed":
      "We couldn't read your settings. Please try again in a few seconds.",
    "gen.error.profileIncomplete":
      "Complete your profile (age, weight, height and activity) before generating your plan.",
    "gen.error.budgetMissing":
      "Set a weekly budget greater than zero before generating your plan.",
    "gen.error.goalsMissing":
      "Select at least one goal before generating your plan.",
    "gen.error.storesMissing":
      "Select at least one supermarket before generating your plan.",
    "gen.error.quotaExceeded":
      "You've reached the daily limit of generated plans. Try again tomorrow.",
    "gen.error.rateLimited":
      "Too many requests. Wait a moment and try again.",
    "gen.error.aiUnavailable":
      "We couldn't generate your plan. Please try again in a few seconds.",
    "gen.error.aiTimeout": "Generation took too long. Please try again.",
    "gen.error.invalidFormat":
      "The assistant sent an incomplete plan. It almost always works on the next try.",
    "gen.error.restrictionsTooStrict":
      "Your restrictions leave too few foods to work with. Remove some so we can build a varied plan.",
    "gen.error.invalidStore":
      "The plan included a store you didn't choose. Please try again.",
    "gen.error.dietaryViolation":
      "The plan included foods your restrictions forbid. Please try again.",
    "gen.error.portionsInvalid":
      "The plan didn't detail the quantities well. Please try again.",
    "gen.error.goalIncoherent":
      "The plan didn't match your goals. You can try again; each try counts toward your daily limit.",
    "gen.error.budgetTooLow":
      "A plan isn't possible with your current budget.",
    "gen.error.failed":
      "We couldn't generate a valid plan. Review your preferences and try again.",

    "gen.unreachable.title": "As it stands, your plan can't meet all your goals",
    "gen.unreachable.intro":
      "You can raise your budget or ask for the best plan possible as it stands.",
    "gen.unreachable.introBudget": "To get there, you can raise your budget.",
    "gen.unreachable.introForce": "You can ask for the best plan possible as it stands.",
    "gen.unreachable.introAdjust": "You can change your settings and try again.",
    "gen.unreachable.optionsHeading": "What you can do:",
    "gen.unreachable.listHeading": "This is what isn't reached:",
    "gen.unreachable.budget": "Raise your budget by {amount}",
    "gen.unreachable.changeBudget": "Change my budget",
    "gen.unreachable.force": "Give me the plan anyway",
    "gen.unreachable.forceHelp":
      "We'll give you the best plan possible without going over your budget or breaking your restrictions, and tell you what isn't met.",
    "gen.conflict.generic": "One of your goals is not fully reached",
    "gen.conflict.kcal_safety": "Safe calories: you reach {achieved} of {target} a day",
    "gen.conflict.kcal_safety.over":
      "Safe calories: you have {achieved} a day and the safe amount for you is up to {target}",
    "gen.conflict.protein_safety_max":
      "Safe protein limit: you have {achieved} g per kilo and the limit is {target}",
    "gen.conflict.protein_muscle_floor":
      "Protein to build muscle: you reach {achieved} of {target} g per kilo a day. Try raising your budget or picking more meals with chicken, eggs, tuna or lentils.",
    "gen.conflict.kcal_range": "Calories: you reach {achieved} of {target} a day",
    "gen.conflict.kcal_range.over":
      "Calories: you have {achieved} a day and the most we aim for is {target}",
    "gen.conflict.protein_min":
      "Protein: you reach {achieved} of {target} g per kilo a day. Try raising your budget or picking more meals with chicken, eggs, tuna or lentils.",
    "gen.conflict.protein_max":
      "Protein maximum: you have {achieved} g per kilo and the maximum is {target}",
    "gen.conflict.carbs_min_muscle":
      "Carbs (rice, potato, bread): you reach {achieved} of {target} g per kilo a day",
    "gen.conflict.meal_protein_muscle":
      "Protein in each meal: one meal reaches {achieved} of {target} g",
    "gen.conflict.meal_protein_muscle.over":
      "Protein in each meal: one meal has {achieved} g and the most we aim for is {target} g",
    "gen.conflict.fruit_veg_min": "Fruit and vegetables: you reach {achieved} of {target} g a day",
    "gen.conflict.fiber_min": "Fiber: you reach {achieved} of {target} g a day",
    "gen.conflict.free_sugar_max":
      "Added sugar: it is {achieved} % of your calories and we recommend less than {target} %",
    "gen.conflict.sodium_max":
      "Salt: you have {achieved} mg a day and we recommend less than {target} mg",
    "gen.conflict.fat_max":
      "Fat: it is {achieved} % of your calories and we recommend up to {target} %",
    "gen.conflict.sat_fat_max":
      "Saturated fat (like the fat in butter): it is {achieved} % of your calories and we recommend less than {target} %",
    "gen.conflict.legumes_week":
      "Meals with lentils, beans or chickpeas: you reach {achieved} of {target} a week",
    "gen.conflict.distinct_foods_week":
      "Variety: you reach {achieved} of {target} different foods a week",
    "gen.conflict.gaba_groups_day": "Food groups: one day you reach {achieved} of {target}",
    "gen.conflict.meal_kcal_share_max":
      "Calories per meal: one meal has {achieved} % of the day's calories and we recommend up to {target} %",
    "gen.conflict.breakfast_protein_min": "Breakfast protein: you reach {achieved} of {target} g",
    "gen.conflict.breakfast_fiber_min": "Breakfast fiber: you reach {achieved} of {target} g",
    "gen.conflict.iron_sources_week":
      "Meals with iron: you reach {achieved} of {target} a week",
    "gen.conflict.cheap_protein_share":
      "Low-cost protein (eggs, lentils, chicken): you reach {achieved} % of your protein; we aim for {target} %",
  },
});
