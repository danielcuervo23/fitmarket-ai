import { defineMessages } from "../define";

export const legal = defineMessages({
  es: {
    "consent.label": "Acepto la {link}",
    "consent.link": "Política de privacidad",
    "consent.required": "Debes aceptar la política de privacidad para continuar.",

    "privacy.title": "Política de privacidad",
    "privacy.updated": "Última actualización: {date}",
    "privacy.draftNote":
      "Este documento es un borrador informativo del proyecto y no constituye asesoría legal.",
    "privacy.s1.title": "Qué datos recopilamos",
    "privacy.s1.body":
      "Tu correo y nombre; tus datos físicos (edad, peso, altura y nivel de actividad); tus objetivos, presupuesto semanal, supermercados y restricciones alimentarias; y los planes que generas. Los datos de peso, altura y restricciones pueden considerarse datos de salud.",
    "privacy.s2.title": "Para qué los usamos",
    "privacy.s2.body":
      "Únicamente para crear tu cuenta, personalizar tu menú y tu lista de compras, y guardar tu historial de planes. No vendemos tus datos ni los usamos para publicidad.",
    "privacy.s3.title": "Quién los procesa",
    "privacy.s3.body":
      "Usamos Supabase para la autenticación y el almacenamiento, y OpenAI para generar tu plan. A OpenAI solo se envían los datos necesarios para el plan (edad, peso, altura, actividad, objetivos, presupuesto, supermercados y restricciones), nunca tu nombre ni tu correo.",
    "privacy.s4.title": "Tus decisiones",
    "privacy.s4.body":
      "Puedes ver y cambiar tus preferencias en cualquier momento desde Mi cuenta. También puedes eliminar tu cuenta y todos tus datos de forma permanente desde la misma pantalla.",
    "privacy.s5.title": "Seguridad",
    "privacy.s5.body":
      "Tus datos viajan cifrados y cada usuario solo puede acceder a su propia información. Aun así, ningún sistema es infalible: usa una contraseña única y segura.",
    "privacy.s6.title": "Aviso de salud",
    "privacy.s6.body":
      "Los planes son una guía generada por IA y no reemplazan el consejo de un profesional de la salud. Si tienes alergias graves o una condición médica, consulta a un especialista y revisa siempre los ingredientes.",

    "account.privacy": "Política de privacidad",
    "account.dangerZone": "Zona de peligro",
    "account.delete": "Eliminar mi cuenta",
    "account.deleteWarning":
      "Se borrarán de forma permanente tu cuenta, tus preferencias y todos tus planes. Esta acción no se puede deshacer.",
    "account.deletePrompt": "Escribe {word} para confirmar",
    "account.deleteWord": "ELIMINAR",
    "account.deleteConfirm": "Eliminar definitivamente",
    "account.deleteFailed":
      "No pudimos eliminar tu cuenta. Intenta de nuevo o contacta soporte.",
  },
  en: {
    "consent.label": "I accept the {link}",
    "consent.link": "Privacy policy",
    "consent.required": "You must accept the privacy policy to continue.",

    "privacy.title": "Privacy policy",
    "privacy.updated": "Last updated: {date}",
    "privacy.draftNote":
      "This document is an informational draft for the project and is not legal advice.",
    "privacy.s1.title": "What data we collect",
    "privacy.s1.body":
      "Your email and name; your body data (age, weight, height and activity level); your goals, weekly budget, supermarkets and dietary restrictions; and the plans you generate. Weight, height and restrictions can be considered health data.",
    "privacy.s2.title": "What we use it for",
    "privacy.s2.body":
      "Only to create your account, personalize your menu and shopping list, and keep your plan history. We don't sell your data or use it for advertising.",
    "privacy.s3.title": "Who processes it",
    "privacy.s3.body":
      "We use Supabase for authentication and storage, and OpenAI to generate your plan. Only the data needed for the plan (age, weight, height, activity, goals, budget, supermarkets and restrictions) is sent to OpenAI, never your name or email.",
    "privacy.s4.title": "Your choices",
    "privacy.s4.body":
      "You can view and change your preferences at any time in My account. You can also permanently delete your account and all your data from the same screen.",
    "privacy.s5.title": "Security",
    "privacy.s5.body":
      "Your data is encrypted in transit and each user can only access their own information. Still, no system is perfect: use a strong, unique password.",
    "privacy.s6.title": "Health notice",
    "privacy.s6.body":
      "Plans are an AI-generated guide and don't replace advice from a health professional. If you have severe allergies or a medical condition, consult a specialist and always check ingredients.",

    "account.privacy": "Privacy policy",
    "account.dangerZone": "Danger zone",
    "account.delete": "Delete my account",
    "account.deleteWarning":
      "Your account, preferences and all your plans will be permanently deleted. This can't be undone.",
    "account.deletePrompt": "Type {word} to confirm",
    "account.deleteWord": "DELETE",
    "account.deleteConfirm": "Delete permanently",
    "account.deleteFailed":
      "We couldn't delete your account. Please try again or contact support.",
  },
});
