import { ContactField } from 'expo-contacts';

export const CONTACT_IMPORT_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.PHONES,
] as const;

export type ContactsDialogAction = {
  readonly label: string;
  readonly onPress?: () => void;
  readonly tone?: 'default' | 'destructive';
};

export type ContactsDialogState = {
  readonly actions?: readonly ContactsDialogAction[];
  readonly message: string;
  readonly title: string;
};

export type ImportContactCandidate = {
  readonly fullName: string;
  readonly id: string;
  readonly phone: string;
};
