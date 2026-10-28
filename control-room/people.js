// The people the control room names, read from the environment like PLATFORM_ADMIN_EMAILS (controlRoom.js). Each is
// a placeholder or nobody until Julian sets it.
//
//   PLATFORM_PRIVACY_CONTACT  who answers privacy questions (plan 8.6), shown on the terms page and with the breach
//                             register. Default privacy@ the platform domain, a placeholder until Julian names one.
//   PLATFORM_ADMIN_EMAIL      Julian's own address: every use of the backup person's access is emailed there (plan 8.7).
//                             Nobody by default, and then the backup person's access stays shut.
//   PLATFORM_BACKUP_PERSON    the one person with sealed emergency access (backupPerson.js, plan 8.7). Nobody by default.
import { platformSettings } from "../services/settings.js";

const EMAIL = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/;

export function controlRoomPeople(env = process.env) {
  const problems = [];
  const address = (name, fallback = null) => {
    const value = String(env[name] ?? "").trim().toLowerCase();
    if (!value) return fallback;
    if (!EMAIL.test(value)) problems.push(`${name} is not an email address`);
    return value;
  };
  const people = {
    privacyContact: address("PLATFORM_PRIVACY_CONTACT", `privacy@${platformSettings(env).domain}`),
    adminEmail: address("PLATFORM_ADMIN_EMAIL"),
    backupPerson: address("PLATFORM_BACKUP_PERSON"),
  };
  if (problems.length) throw new Error(`The control room's settings have problems: ${problems.join("; ")}`);
  return people;
}
