import { render, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { LocationRegionalSettingsFields } from './LocationRegionalSettingsFields';

function ControlledFields() {
  const [countryCode, setCountryCode] = useState('EC');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [timezone, setTimezone] = useState('America/Guayaquil');
  return (
    <>
      <LocationRegionalSettingsFields
        countryCode={countryCode}
        currencyCode={currencyCode}
        onChangeCountry={setCountryCode}
        onChangeCurrency={setCurrencyCode}
        onChangeTimezone={setTimezone}
        timezone={timezone}
      />
      <Text testID="selected-settings">
        {`${countryCode}|${currencyCode}|${timezone}`}
      </Text>
    </>
  );
}

describe('LocationRegionalSettingsFields', () => {
  it('permite seleccionar país, moneda y zona horaria', async () => {
    const user = userEvent.setup();
    const view = await render(<ControlledFields />);

    await user.press(view.getByLabelText('País'));
    await user.press(view.getByText('Argentina'));
    expect(view.getByTestId('selected-settings')).toHaveTextContent(
      'AR|USD|America/Guayaquil',
    );

    await user.press(view.getByLabelText('Moneda'));
    await user.press(view.getByText('ARS — Peso argentino'));
    expect(view.getByTestId('selected-settings')).toHaveTextContent(
      'AR|ARS|America/Guayaquil',
    );

    await user.press(view.getByLabelText('Zona horaria'));
    await user.press(view.getByText('America/Argentina/Buenos_Aires'));
    expect(view.getByTestId('selected-settings')).toHaveTextContent(
      'AR|ARS|America/Argentina/Buenos_Aires',
    );
  });

  it('permite recorrer y elegir opciones adicionales de moneda y zona horaria', async () => {
    const user = userEvent.setup();
    const view = await render(<ControlledFields />);

    await user.press(view.getByLabelText('Moneda'));
    expect(view.getByTestId('regional-options-scroll')).toBeTruthy();
    await user.press(view.getByText('JPY — Yen japonés'));
    expect(view.getByTestId('selected-settings')).toHaveTextContent(
      'EC|JPY|America/Guayaquil',
    );

    await user.press(view.getByLabelText('Zona horaria'));
    expect(view.getByTestId('regional-options-scroll')).toBeTruthy();
    await user.press(view.getByText('Pacific/Auckland'));
    expect(view.getByTestId('selected-settings')).toHaveTextContent(
      'EC|JPY|Pacific/Auckland',
    );
  });
});
