import { render, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  COUNTRIES,
  CountryCityFields,
  PhoneCountryField,
  resolveCountryName,
} from './RegistrationSelectors';

describe('country names', () => {
  it('funciona en Hermes cuando Intl.DisplayNames no existe', () => {
    expect(resolveCountryName('EC', null)).toBe('Ecuador');
    expect(resolveCountryName('ZZ', null)).toBe('ZZ');
  });
});

function ControlledPhoneField({ onChangeText }: { onChangeText: jest.Mock }) {
  const [phone, setPhone] = useState('');
  return (
    <PhoneCountryField
      countryCode="EC"
      onChangeCountry={jest.fn()}
      onChangeText={(value) => {
        setPhone(value);
        onChangeText(value);
      }}
      value={phone}
    />
  );
}

function ControlledCountryCityFields({ onCity }: { onCity: jest.Mock }) {
  const [city, setCity] = useState('');
  return (
    <CountryCityFields
      city={city}
      countryCode="EC"
      onCity={(value) => {
        setCity(value);
        onCity(value);
      }}
      onCountry={jest.fn()}
    />
  );
}

describe('PhoneCountryField', () => {
  it('permite escribir números y los propaga al formulario', async () => {
    const onChangeText = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 24, left: 0, right: 0, top: 24 },
        }}
      >
        <ControlledPhoneField onChangeText={onChangeText} />
      </SafeAreaProvider>,
    );

    await user.type(view.getByLabelText('Número telefónico'), '099 123-4567');

    expect(onChangeText).toHaveBeenLastCalledWith('099 123-4567');
  });
});

describe('CountryCityFields', () => {
  it('conserva todos los países y permite registrar cualquier ciudad', async () => {
    const onCity = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 24, left: 0, right: 0, top: 24 },
        }}
      >
        <ControlledCountryCityFields onCity={onCity} />
      </SafeAreaProvider>,
    );

    expect(COUNTRIES.length).toBeGreaterThan(200);
    await user.type(view.getByLabelText('Ciudad'), 'Samborondón');
    expect(onCity).toHaveBeenLastCalledWith('Samborondón');
  });
});
