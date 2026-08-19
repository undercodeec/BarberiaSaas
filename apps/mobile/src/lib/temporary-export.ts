import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface TemporaryExportInput {
  readonly contents: string;
  readonly encoding?: 'base64' | 'utf8';
  readonly filename: string;
  readonly mimeType: string;
}

export async function runTemporaryShare(input: {
  readonly remove: () => void;
  readonly share: () => Promise<void>;
  readonly write: () => void;
}) {
  try {
    input.write();
    await input.share();
  } finally {
    input.remove();
  }
}

function downloadOnWeb(input: TemporaryExportInput) {
  const link = document.createElement('a');
  const blob = new Blob([input.contents], { type: input.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  try {
    link.download = input.filename;
    link.href = objectUrl;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function shareTemporaryExport(input: TemporaryExportInput) {
  if (Platform.OS === 'web') {
    downloadOnWeb(input);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      'No hay una aplicación disponible para compartir archivos.',
    );
  }

  const file = new File(Paths.cache, input.filename);
  await runTemporaryShare({
    remove: () => {
      if (file.exists) file.delete();
    },
    share: () =>
      Sharing.shareAsync(file.uri, {
        dialogTitle: input.filename,
        mimeType: input.mimeType,
      }),
    write: () => {
      file.create({ intermediates: true, overwrite: true });
      file.write(input.contents, { encoding: input.encoding ?? 'utf8' });
    },
  });
}
