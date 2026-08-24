import { DOMParser } from '@xmldom/xmldom';

import type { SriEnvironment } from './sri-core';

const SOAP_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/';

export interface SriMessage {
  readonly code: string | null;
  readonly detail: string | null;
  readonly message: string | null;
  readonly type: string | null;
}

export interface SriReceptionResult {
  readonly messages: readonly SriMessage[];
  readonly status: 'RECIBIDA' | 'DEVUELTA';
}

export interface SriAuthorizationResult {
  readonly authorizationDate: Date | null;
  readonly authorizationNumber: string | null;
  readonly authorizedXml: string | null;
  readonly messages: readonly SriMessage[];
  readonly status: 'AUT' | 'NAT' | 'PPR';
}

function sriEndpoint(
  environment: SriEnvironment,
  service: 'reception' | 'authorization',
) {
  const host =
    environment === 'production' ? 'cel.sri.gob.ec' : 'celcer.sri.gob.ec';
  const operation =
    service === 'reception'
      ? 'RecepcionComprobantesOffline'
      : 'AutorizacionComprobantesOffline';
  return `https://${host}/comprobantes-electronicos-ws/${operation}`;
}

function text(node: Element | undefined, tagName: string) {
  const element = node?.getElementsByTagName(tagName)[0];
  return element?.textContent?.trim() || null;
}

function parseMessages(scope: Element | undefined): readonly SriMessage[] {
  if (!scope) return [];
  return [...scope.getElementsByTagName('mensaje')].map((message) => ({
    code: text(message, 'identificador'),
    detail: text(message, 'informacionAdicional'),
    message: text(message, 'mensaje'),
    type: text(message, 'tipo'),
  }));
}

function parseResponse(xml: string) {
  const document = new DOMParser({
    errorHandler: { error: () => undefined, fatalError: () => undefined },
  }).parseFromString(xml, 'text/xml');
  const fault = document
    .getElementsByTagName('faultstring')[0]
    ?.textContent?.trim();
  if (fault) throw new Error(`SRI SOAP fault: ${fault}`);
  return document;
}

async function callSri(endpoint: string, body: string) {
  const response = await fetch(endpoint, {
    body,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  });
  const responseBody = await response.text();
  if (!response.ok)
    throw new Error(`SRI HTTP ${response.status}: ${response.statusText}`);
  return parseResponse(responseBody);
}

function envelope(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${SOAP_NAMESPACE}"><soap:Body>${content}</soap:Body></soap:Envelope>`;
}

/** Cliente SOAP directo; no usa credenciales de SRI en Línea ni fija certificados TLS. */
export class SriClient {
  public constructor(private readonly environment: SriEnvironment) {}

  public async receive(signedXml: string): Promise<SriReceptionResult> {
    const encodedXml = Buffer.from(signedXml, 'utf8').toString('base64');
    const document = await callSri(
      sriEndpoint(this.environment, 'reception'),
      envelope(
        `<ns:validarComprobante xmlns:ns="http://ec.gob.sri.ws.recepcion"><xml>${encodedXml}</xml></ns:validarComprobante>`,
      ),
    );
    const response = document.getElementsByTagName(
      'RespuestaRecepcionComprobante',
    )[0];
    const status = text(response, 'estado');
    if (status !== 'RECIBIDA' && status !== 'DEVUELTA')
      throw new Error(
        'La respuesta de recepción SRI no contiene un estado válido.',
      );
    return { messages: parseMessages(response), status };
  }

  public async authorize(accessKey: string): Promise<SriAuthorizationResult> {
    const document = await callSri(
      sriEndpoint(this.environment, 'authorization'),
      envelope(
        `<ns:autorizacionComprobante xmlns:ns="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${accessKey}</claveAccesoComprobante></ns:autorizacionComprobante>`,
      ),
    );
    const authorization = document.getElementsByTagName('autorizacion')[0];
    if (!authorization)
      return {
        authorizationDate: null,
        authorizationNumber: null,
        authorizedXml: null,
        messages: [],
        status: 'PPR',
      };
    const rawStatus = text(authorization, 'estado');
    const status =
      rawStatus === 'AUTORIZADO'
        ? 'AUT'
        : rawStatus === 'NO AUTORIZADO' || rawStatus === 'RECHAZADO'
          ? 'NAT'
          : 'PPR';
    const date = text(authorization, 'fechaAutorizacion');
    const parsedDate = date ? new Date(date) : null;
    return {
      authorizationDate:
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      authorizationNumber: text(authorization, 'numeroAutorizacion'),
      authorizedXml: text(authorization, 'comprobante'),
      messages: parseMessages(authorization),
      status,
    };
  }
}
