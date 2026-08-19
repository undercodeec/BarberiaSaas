import { createCsv } from './csv-export';

describe('createCsv', () => {
  it('escapa comillas, saltos de línea y fórmulas de hoja de cálculo', () => {
    expect(
      createCsv(
        ['Nombre', 'Notas'],
        [
          ['Ana "Nava"', '=HYPERLINK("https://example.test")'],
          ['Luis', 'línea 1\nlínea 2'],
        ],
      ),
    ).toBe(
      '\uFEFF"Nombre","Notas"\r\n' +
        '"Ana ""Nava""","\'=HYPERLINK(""https://example.test"")"\r\n' +
        '"Luis","línea 1\nlínea 2"\r\n',
    );
  });

  it('conserva celdas grandes sin truncar', () => {
    const largeCell = 'a'.repeat(100_000);
    expect(createCsv(['Notas'], [[largeCell]])).toContain(largeCell);
  });
});
