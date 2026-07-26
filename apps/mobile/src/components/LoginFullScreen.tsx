import Ionicons from '@expo/vector-icons/Ionicons';
import { type SignInInput, signInSchema } from '@barber-saas/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import { Image, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavaButton } from './NavaButton';
import { useAuth } from '../providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loginBackground = require('../../assets/loginbanner.png') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const logoImage = require('../../assets/nava-logo.png') as number;

export function LoginFullScreen({ invitationToken }: { readonly invitationToken?: string | undefined }) {
  const router = useRouter();
  const { signIn } = useAuth();
  const { height, width } = useWindowDimensions();
  const compact = height < 760;
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, formState } = useForm<SignInInput>({ defaultValues: { email: '', password: '' }, resolver: zodResolver(signInSchema) });
  const submit = handleSubmit(async (input) => {
    setFormError(null);
    try { await signIn(input); router.replace(invitationToken ? { params: { token: invitationToken }, pathname: '/(onboarding)/accept-invitation' } : '/'); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'No fue posible iniciar sesión.'); }
  });
  return <ImageBackground imageStyle={styles.backgroundImage} resizeMode="cover" source={loginBackground} style={[styles.background, { minHeight: height, width }]}>
    <StatusBar style="light" />
    <SafeAreaView edges={['bottom', 'left', 'right', 'top']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={[styles.content, { minHeight: height }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.backButton}><Ionicons color="#ffffff" name="arrow-back" size={23} /><Text style={styles.backLabel}>Regresar al inicio</Text></Pressable>
          <View style={[styles.brand, compact ? styles.brandCompact : null]}><Image accessibilityLabel="Nava" resizeMode="contain" source={logoImage} style={styles.brandName} /><Text style={styles.brandMessage}>Bienvenido de nuevo</Text></View>
          <View style={styles.formCard}>
            <Text accessibilityRole="header" style={styles.title}>Iniciar sesión</Text>
            <Text style={styles.subtitle}>Ingresa tus datos para continuar.</Text>
            {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}
            <Controller control={control} name="email" render={({ field, fieldState }) => <View style={styles.field}><Text style={styles.label}>Correo electrónico</Text><View style={[styles.inputShell, fieldState.error ? styles.inputError : null]}><Ionicons color="#667080" name="mail-outline" size={21} /><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onBlur={field.onBlur} onChangeText={field.onChange} placeholder="correo@ejemplo.com" placeholderTextColor="#98a0ab" style={styles.input} value={field.value} /></View>{fieldState.error ? <Text accessibilityRole="alert" style={styles.fieldError}>{fieldState.error.message}</Text> : null}</View>} />
            <Controller control={control} name="password" render={({ field, fieldState }) => <View style={styles.field}><Text style={styles.label}>Contraseña</Text><View style={[styles.inputShell, fieldState.error ? styles.inputError : null]}><Ionicons color="#667080" name="lock-closed-outline" size={21} /><TextInput autoComplete="current-password" onBlur={field.onBlur} onChangeText={field.onChange} placeholder="Ingresa tu contraseña" placeholderTextColor="#98a0ab" secureTextEntry={!showPassword} style={styles.input} value={field.value} /><Pressable accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setShowPassword((current) => !current)}><Ionicons color="#667080" name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} /></Pressable></View>{fieldState.error ? <Text accessibilityRole="alert" style={styles.fieldError}>{fieldState.error.message}</Text> : null}</View>} />
            <Link href="/(auth)/recover" style={[styles.forgot, { color: '#101c2d' }]}>¿Olvidaste tu contraseña?</Link>
            <NavaButton disabled={formState.isSubmitting} icon="log-in-outline" label="Iniciar sesión" loading={formState.isSubmitting} onPress={() => void submit()} style={styles.loginButton} variant="primary" />
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.homeButton}><Ionicons color="#101c2d" name="home-outline" size={20} /><Text style={styles.homeLabel}>Regresar al inicio</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ImageBackground>;
}

const styles = StyleSheet.create({ background: { flex: 1, overflow: 'hidden' }, backgroundImage: { height: '100%', width: '100%' }, backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingVertical: 10 }, backLabel: { color: '#fff', fontSize: 15, fontWeight: '800' }, brand: { alignItems: 'center', minHeight: 220, paddingTop: 24 }, brandCompact: { minHeight: 125, paddingTop: 8 }, brandMessage: { color: 'rgba(255,255,255,0.82)', fontSize: 16, fontWeight: '600', marginTop: 8 }, brandName: { height: 58, width: 178 }, content: { alignSelf: 'center', flexGrow: 1, paddingBottom: 24, paddingHorizontal: 18, paddingTop: 4, width: '100%', maxWidth: 480 }, field: { marginBottom: 17 }, fieldError: { color: '#bd2d2d', fontSize: 13, marginTop: 6 }, forgot: { alignSelf: 'flex-end', color: '#2464e8', fontSize: 14, fontWeight: '800', marginBottom: 20, marginTop: -2 }, formCard: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 28, maxWidth: 430, padding: 24, shadowColor: '#071120', shadowOffset: { height: 8, width: 0 }, shadowOpacity: .15, shadowRadius: 22, width: '100%' }, formError: { backgroundColor: '#fff0ee', borderRadius: 12, color: '#a72d27', marginBottom: 17, padding: 12 }, homeButton: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 22, paddingVertical: 8 }, homeLabel: { color: '#101c2d', fontSize: 15, fontWeight: '800' }, input: { color: '#101c2d', flex: 1, fontSize: 16, minHeight: 54 }, inputError: { borderColor: '#bd2d2d' }, inputShell: { alignItems: 'center', backgroundColor: '#f7f8fa', borderColor: '#d9dde3', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 56, paddingHorizontal: 15 }, keyboard: { flex: 1 }, label: { color: '#101c2d', fontSize: 14, fontWeight: '800', marginBottom: 8 }, loginButton: { flexBasis: 'auto', flexGrow: 0, flexShrink: 0, height: 66, width: '100%' }, safeArea: { flex: 1 }, subtitle: { color: '#667080', fontSize: 16, lineHeight: 23, marginBottom: 24, marginTop: 8 }, title: { color: '#101c2d', fontSize: 30, fontWeight: '900', letterSpacing: -.9 } });
