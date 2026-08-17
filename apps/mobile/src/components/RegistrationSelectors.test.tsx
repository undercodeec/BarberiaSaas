import { render, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PhoneCountryField } from './RegistrationSelectors';

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
