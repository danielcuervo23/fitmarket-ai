import { defineMessages } from "../define";

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
      "El plan no cumplía tus objetivos. Intenta de nuevo.",
    "gen.error.budgetTooLow":
      "No fue posible generar un plan con tu presupuesto actual.",
    "gen.error.failed":
      "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.",
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
      "The plan didn't match your goals. Please try again.",
    "gen.error.budgetTooLow":
      "A plan isn't possible with your current budget.",
    "gen.error.failed":
      "We couldn't generate a valid plan. Review your preferences and try again.",
  },
});
