import { coachmarkLayout } from './coachmark-layout';

describe('coachmarkLayout', () => {
  it('ubica el banner debajo del elemento cuando hay espacio visible suficiente', () => {
    expect(
      coachmarkLayout({
        insets: { bottom: 34, top: 44 },
        rect: { height: 40, width: 80, x: 24, y: 100 },
        window: { height: 844, width: 390 },
      }),
    ).toMatchObject({
      maxHeight: 636,
      placement: 'below',
      top: 158,
    });
  });

  it('mueve el banner encima del elemento cuando abajo no cabe completo', () => {
    expect(
      coachmarkLayout({
        insets: { bottom: 20, top: 24 },
        rect: { height: 52, width: 52, x: 320, y: 480 },
        window: { height: 600, width: 390 },
      }),
    ).toMatchObject({
      maxHeight: 422,
      placement: 'above',
      top: 218,
    });
  });
});
