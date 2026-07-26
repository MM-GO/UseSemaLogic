import { buildSLInterpreterAnchor, extractSLInterpreterAnchorData } from './src/sl_interpreter_helpers';

describe('SL Interpreter anchor generation', () => {
  it('creates an SL interpreter anchor with href and no inline style', () => {
    const result = buildSLInterpreterAnchor(
      'Master of Science',
      'Master of Science [necessary credit points, Cognitive Systems]'
    );

    expect(result).toContain('href="#sl-interpreter"');
    expect(result).toContain('data-sl-interpreter="1"');
    expect(result).toContain('data-sl-text="Master of Science [necessary credit points, Cognitive Systems]"');
    expect(result).toContain('title="Master of Science [necessary credit points, Cognitive Systems]"');
    expect(result).not.toContain('style=');
    expect(result).toContain('>Master of Science<');
  });

  it('builds the SL interpreter anchor with correct href and title fallback', () => {
    const html = buildSLInterpreterAnchor(
      'Ausbildungsstätten',
      ';Ausbildungsstaetten.Par.2.Abs.2 [ AS_Abs2_Ergaenzungsschule, AS_Abs2_NichtstaatlicheHochschule, AS_Abs2_NichtstaatlicheAkademie ]Ausbildungsstaetten.Par.2.Abs.2.lawLink := DE.BAföG.Par.2.Abs.2;'
    );

    expect(html).toContain('href="#sl-interpreter"');
    expect(html).toContain('data-sl-interpreter="1"');
    expect(html).toContain('data-sl-text=";Ausbildungsstaetten.Par.2.Abs.2 [ AS_Abs2_Ergaenzungsschule, AS_Abs2_NichtstaatlicheHochschule, AS_Abs2_NichtstaatlicheAkademie ]Ausbildungsstaetten.Par.2.Abs.2.lawLink := DE.BAföG.Par.2.Abs.2;"');
    expect(html).toContain('title=";Ausbildungsstaetten.Par.2.Abs.2 [ AS_Abs2_Ergaenzungsschule, AS_Abs2_NichtstaatlicheHochschule, AS_Abs2_NichtstaatlicheAkademie ]Ausbildungsstaetten.Par.2.Abs.2.lawLink := DE.BAföG.Par.2.Abs.2;"');
    expect(html).not.toContain('style=');
    expect(html).toContain('>Ausbildungsstätten<');
  });

  it('escapes HTML entities in data-sl-text and title', () => {
    const result = buildSLInterpreterAnchor('Test', 'A & B <C>');

    expect(result).toContain('data-sl-text="A &amp; B &lt;C&gt;"');
    expect(result).toContain('title="A &amp; B &lt;C&gt;"');
  });

  it('extracts visible text and slText from an SL interpreter anchor', () => {
    const html = '<a href="#sl-interpreter" data-sl-interpreter="1" data-sl-text="Example SL" title="Example SL">visible text</a>';
    const result = extractSLInterpreterAnchorData(html);

    expect(result).toEqual({
      visibleText: 'visible text',
      slText: 'Example SL'
    });
  });

  it('falls back to data-sl-ref when no data-sl-text is present', () => {
    const html = '<a href="#sl-interpreter" data-sl-interpreter="1" data-sl-ref="indirect(lawLink, Symbol / Reference / Defined / Used / ... , DE.BAföG.Par.2.Abs.1.Nr.6);">visible text</a>';
    const result = extractSLInterpreterAnchorData(html);

    expect(result).toEqual({
      visibleText: 'visible text',
      slText: 'indirect(lawLink, Symbol / Reference / Defined / Used / ... , DE.BAföG.Par.2.Abs.1.Nr.6);'
    });
  });

  it('handles long data-sl-text values with href #sl-interpreter', () => {
    const html = '<a href="#sl-interpreter" data-sl-interpreter="1" data-sl-text=";Ausbildungsstaetten.Par.2.Abs.2 [ AS_Abs2_Ergaenzungsschule, AS_Abs2_NichtstaatlicheHochschule, AS_Abs2_NichtstaatlicheAkademie ]Ausbildungsstaetten.Par.2.Abs.2.lawLink := DE.BAföG.Par.2.Abs.2;" title=";Ausbildungsstaetten.Par.2.Abs.2 [ AS_Abs2_Ergaenzungsschule, AS_Abs2_NichtstaatlicheHochschule, AS_Abs2_NichtstaatlicheAkademie ]Ausbildungsstaetten.Par.2.Abs.2.lawLink := DE.BAföG.Par.2.Abs.2;">visible text</a>';
    const result = extractSLInterpreterAnchorData(html);

    expect(result).toEqual({
      visibleText: 'visible text',
      slText: ';Ausbildungsstaetten.Par.2.Abs.2 [ AS_Abs2_Ergaenzungsschule, AS_Abs2_NichtstaatlicheHochschule, AS_Abs2_NichtstaatlicheAkademie ]Ausbildungsstaetten.Par.2.Abs.2.lawLink := DE.BAföG.Par.2.Abs.2;'
    });
  });
});
