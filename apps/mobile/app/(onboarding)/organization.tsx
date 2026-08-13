import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  OnboardingCollaboratorRecord,
  OnboardingCollaboratorsResponse,
} from '@barber-saas/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type CollaboratorDraft,
  CollaboratorFormSheet,
} from '../../src/components/CollaboratorFormSheet';
import { NavaButton } from '../../src/components/NavaButton';
import { useAuth } from '../../src/providers/AuthProvider';
import { requireApiClient } from '../../src/lib/api';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const teamIllustration = require('../../assets/onboarding-team.png') as number;

interface StoredCollaborator extends CollaboratorDraft {
  readonly id: string;
}

function toStoredCollaborator(
  collaborator: OnboardingCollaboratorRecord,
): StoredCollaborator {
  return {
    agendaColor: collaborator.agendaColor,
    canPerformServices: collaborator.canPerformServices,
    customRoleDescription: collaborator.customRoleDescription ?? '',
    customRoleName: collaborator.customRoleName ?? '',
    description: collaborator.description ?? '',
    id: collaborator.id,
    identification: collaborator.identification ?? '',
    name: collaborator.name,
    phone: collaborator.phone ?? '',
    photoUri: collaborator.photoUri,
    role: collaborator.role,
  };
}

function optionalValue(value: string) {
  return value.trim() || null;
}

export default function OrganizationOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { height, width } = useWindowDimensions();
  const compact = height < 740;
  const [collaboratorSheetOpen, setCollaboratorSheetOpen] = useState(false);
  const [editingCollaborator, setEditingCollaborator] =
    useState<StoredCollaborator | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const collaboratorsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingCollaboratorsResponse>(
        '/v1/onboarding/collaborators',
      ),
    queryKey: ['onboarding-collaborators'],
  });
  const collaborators = (collaboratorsQuery.data?.collaborators ?? []).map(
    toStoredCollaborator,
  );

  if (!session) return <Redirect href="/(auth)/login" />;

  const saveCollaborator = async (collaborator: CollaboratorDraft) => {
    setRequestError(null);
    const payload = {
      ...collaborator,
      customRoleDescription: optionalValue(collaborator.customRoleDescription),
      customRoleName: optionalValue(collaborator.customRoleName),
      description: optionalValue(collaborator.description),
      identification: optionalValue(collaborator.identification),
      phone: optionalValue(collaborator.phone),
    };
    if (editingCollaborator) {
      await requireApiClient().request(
        `/v1/onboarding/collaborators/${editingCollaborator.id}`,
        { body: payload, method: 'PATCH' },
      );
    } else {
      await requireApiClient().request('/v1/onboarding/collaborators', {
        body: payload,
        method: 'POST',
      });
    }
    await queryClient.invalidateQueries({
      queryKey: ['onboarding-collaborators'],
    });
    setEditingCollaborator(null);
    setCollaboratorSheetOpen(false);
  };

  const deleteCollaborator = async (collaborator: StoredCollaborator) => {
    setRequestError(null);
    await requireApiClient().request<void>(
      `/v1/onboarding/collaborators/${collaborator.id}`,
      { method: 'DELETE' },
    );
    await queryClient.invalidateQueries({
      queryKey: ['onboarding-collaborators'],
    });
    setEditingCollaborator(null);
    setCollaboratorSheetOpen(false);
  };

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />

      <View pointerEvents="none" style={styles.background}>
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact ? styles.contentCompact : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Regresar"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/(onboarding)/account-setup')
          }
          style={styles.backButton}
        >
          <Ionicons color="#101c2d" name="arrow-back" size={23} />
          <Text style={styles.backLabel}>Regresar</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Configura tu cuenta</Text>

          <View
            accessibilityLabel="Paso 1 de 4"
            accessibilityRole="progressbar"
            style={styles.progress}
          >
            <View style={styles.activeStep} />
            <View style={styles.step} />
            <View style={styles.step} />
            <View style={styles.step} />
          </View>
        </View>

        <View style={styles.main}>
          <Image
            accessibilityLabel="Equipo profesional de barbería"
            resizeMode="contain"
            source={teamIllustration}
            style={[
              styles.illustration,
              compact ? styles.illustrationCompact : null,
              { maxWidth: Math.min(width + 8, 560) },
            ]}
          />

          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>
              Colabora con tu equipo de trabajo
            </Text>
            <Text style={styles.description}>
              Ahora, vamos a configurar a tus colaboradores para que queden
              registrados y puedan realizar servicios dentro de la aplicación.
            </Text>
          </View>

          <NavaButton
            compact={width < 390}
            icon="person-add-outline"
            label={
              collaborators.length > 0
                ? 'Añadir otro colaborador'
                : 'Añadir colaborador'
            }
            onPress={() => {
              setEditingCollaborator(null);
              setCollaboratorSheetOpen(true);
            }}
            style={styles.actionButton}
            variant="outline"
          />
          {requestError || collaboratorsQuery.error ? (
            <Text accessibilityRole="alert" style={styles.requestError}>
              {requestError ??
                (collaboratorsQuery.error instanceof Error
                  ? collaboratorsQuery.error.message
                  : 'No fue posible cargar los colaboradores.')}
            </Text>
          ) : null}
          {collaboratorsQuery.isPending ? (
            <Text style={styles.savedLabel}>Cargando colaboradores…</Text>
          ) : null}
          {collaborators.map((collaborator) => (
            <View key={collaborator.id} style={styles.collaboratorRow}>
              <View
                style={[
                  styles.collaboratorColor,
                  { backgroundColor: collaborator.agendaColor },
                ]}
              />
              <View style={styles.collaboratorCopy}>
                <Text numberOfLines={1} style={styles.collaboratorName}>
                  {collaborator.name}
                </Text>
                <Text numberOfLines={1} style={styles.collaboratorRole}>
                  {collaborator.role === 'custom'
                    ? collaborator.customRoleName || 'Tipo personalizado'
                    : collaborator.role === 'barber'
                      ? 'Barbero'
                      : 'Administrador'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Editar ${collaborator.name}`}
                accessibilityRole="button"
                onPress={() => {
                  setEditingCollaborator(collaborator);
                  setCollaboratorSheetOpen(true);
                }}
                style={styles.editButton}
              >
                <Ionicons color="#101c2d" name="pencil-outline" size={20} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Eliminar ${collaborator.name}`}
                accessibilityRole="button"
                onPress={() => {
                  Alert.alert(
                    'Eliminar colaborador',
                    `¿Quieres eliminar a ${collaborator.name}? Esta acción no se puede deshacer.`,
                    [
                      { style: 'cancel', text: 'Cancelar' },
                      {
                        onPress: () => void deleteCollaborator(collaborator),
                        style: 'destructive',
                        text: 'Eliminar',
                      },
                    ],
                  );
                }}
                style={styles.deleteIconButton}
              >
                <Ionicons color="#bd2d2d" name="trash-outline" size={20} />
              </Pressable>
            </View>
          ))}
          {collaborators.length > 0 ? (
            <Text style={styles.savedLabel}>
              {collaborators.length}{' '}
              {collaborators.length === 1
                ? 'colaborador añadido'
                : 'colaboradores añadidos'}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <NavaButton
            disabled={collaborators.length === 0}
            icon="arrow-forward-outline"
            label="Siguiente"
            onPress={() => router.push('/(onboarding)/services')}
            style={styles.nextButton}
            variant="primary"
          />
        </View>
      </ScrollView>

      <CollaboratorFormSheet
        key={
          editingCollaborator?.id ??
          (collaboratorSheetOpen ? 'new-collaborator' : 'closed-collaborator')
        }
        initialValue={editingCollaborator}
        onClose={() => {
          setEditingCollaborator(null);
          setCollaboratorSheetOpen(false);
        }}
        onDelete={
          editingCollaborator
            ? () => deleteCollaborator(editingCollaborator)
            : undefined
        }
        onSave={saveCollaborator}
        visible={collaboratorSheetOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activeStep: {
    backgroundColor: '#000000',
    borderRadius: 6,
    height: 10,
    width: 31,
  },
  actionButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    height: 66,
    marginTop: 25,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  backLabel: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '800',
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  bottomGlow: {
    backgroundColor: 'rgba(59, 116, 232, 0.07)',
    borderRadius: 260,
    bottom: -220,
    height: 430,
    left: -220,
    position: 'absolute',
    width: 430,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 640,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 18,
    width: '100%',
  },
  contentCompact: {
    paddingBottom: 12,
    paddingTop: 10,
  },
  copy: {
    alignItems: 'center',
    marginTop: 12,
  },
  collaboratorColor: {
    borderRadius: 999,
    height: 14,
    width: 14,
  },
  collaboratorCopy: {
    flex: 1,
    gap: 2,
  },
  collaboratorName: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '800',
  },
  collaboratorRole: {
    color: '#667080',
    fontSize: 13,
    fontWeight: '600',
  },
  collaboratorRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dce7fb',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  description: {
    color: '#667080',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 490,
    textAlign: 'center',
  },
  deleteIconButton: {
    alignItems: 'center',
    backgroundColor: '#fff0ee',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: '#e8efff',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  eyebrow: {
    color: '#101c2d',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  footer: {
    marginTop: 28,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  illustration: {
    aspectRatio: 1.437,
    width: '108%',
  },
  illustrationCompact: {
    maxHeight: 225,
  },
  main: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 22,
  },
  nextButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    height: 66,
    width: '100%',
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  requestError: {
    color: '#bd283c',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  screen: {
    backgroundColor: '#f9fbff',
    flex: 1,
  },
  savedLabel: {
    color: '#667080',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  step: {
    backgroundColor: '#dce7fb',
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  title: {
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 36,
    maxWidth: 470,
    textAlign: 'center',
  },
  topGlow: {
    backgroundColor: 'rgba(46, 103, 224, 0.08)',
    borderRadius: 260,
    height: 420,
    position: 'absolute',
    right: -230,
    top: -180,
    width: 420,
  },
});
