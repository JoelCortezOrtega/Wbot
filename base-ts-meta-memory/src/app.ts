import * as dotenv from 'dotenv'
import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { MetaProvider as Provider } from '@builderbot/provider-meta'

dotenv.config()
const PORT = process.env.PORT ?? 3008

// Flujo principal de soporte
const supportMainFlow = addKeyword<Provider, Database>(['soporte', 'support', 'ayuda', 'error'])
    .addAnswer(
        [
            '🛠 *Soporte Técnico*',
            'Selecciona el tipo de problema:',
            '',
            '1️⃣ No abre el sistema',
            '2️⃣ Licencia desactivada',
            '3️⃣ Error en portal web',
            '4️⃣ Solicitar cotización',
            '5️⃣ Otro problema',
            '',
            'Escribe solo el número de la opción.'
        ].join('\n'),
        { capture: true },
        async (ctx, { state, fallBack }) => {
            const option = ctx.body.trim()

            if (!['1', '2', '3', '4', '5'].includes(option)) {
                return fallBack('Por favor escribe una opción válida (1-5).')
            }

            await state.update({ option })
        }
    )

// Flujo de cada opción
const noAbreSistemaFlow = addKeyword<Provider, Database>(['1'])
    .addAction(async (_, { state }) => {
        if (state.get('option') !== '1') return false
    })
    .addAnswer(
        '❌ *No abre el sistema*\n¿Aparece algún mensaje de error? (si/no o describe el mensaje)',
        { capture: true },
        async (ctx, { state }) => {
            await state.update({ errorMessage: ctx.body })
        }
    )

const licenciaFlow = addKeyword<Provider, Database>(['2'])
    .addAction(async (_, { state }) => {
        if (state.get('option') !== '2') return false
    })
    .addAnswer(
        '🔑 *Licencia desactivada*\nPor favor envíame tu *número de licencia* o *correo registrado*.',
        { capture: true },
        async (ctx, { state }) => {
            await state.update({ licenseInfo: ctx.body })
        }
    )

const portalFlow = addKeyword<Provider, Database>(['3'])
    .addAction(async (_, { state }) => {
        if (state.get('option') !== '3') return false
    })
    .addAnswer(
        '🌐 *Problema con el portal web*\nEscribe el mensaje que aparece o envía una captura.',
        { capture: true },
        async (ctx, { state }) => {
            await state.update({ portalMessage: ctx.body })
        }
    )

const cotizacionFlow = addKeyword<Provider, Database>(['4'])
    .addAction(async (_, { state }) => {
        if (state.get('option') !== '4') return false
    })
    .addAnswer(
        '💲 *Solicitud de cotización*\nIndica qué producto o servicio deseas cotizar.',
        { capture: true },
        async (ctx, { state }) => {
            await state.update({ quoteRequest: ctx.body })
        }
    )

const otroProblemaFlow = addKeyword<Provider, Database>(['5'])
    .addAction(async (_, { state }) => {
        if (state.get('option') !== '5') return false
    })
    .addAnswer(
        '📝 *Otro problema*\nDescríbeme brevemente la situación.',
        { capture: true },
        async (ctx, { state }) => {
            await state.update({ otherIssue: ctx.body })
        }
    )

// Flujo de resumen y confirmación
const resumenFlow = addKeyword<Provider, Database>(['1', '2', '3', '4', '5'])
    .addAction(async (_, { state, flowDynamic }) => {
        const option = state.get('option')

        if (!option) return

        let resumen = '📋 *Resumen de tu reporte:*\n'

        if (option === '1') resumen += `❌ No abre el sistema\nMensaje: ${state.get('errorMessage')}`
        if (option === '2') resumen += `🔑 Licencia desactivada\nDatos: ${state.get('licenseInfo')}`
        if (option === '3') resumen += `🌐 Error portal web\nMensaje: ${state.get('portalMessage')}`
        if (option === '4') resumen += `💲 Cotización solicitada\nDetalle: ${state.get('quoteRequest')}`
        if (option === '5') resumen += `📝 Otro problema\nDescripción: ${state.get('otherIssue')}`

        await flowDynamic(resumen)
        await flowDynamic('\n¿Deseas ser contactado por un agente humano? (si/no)')
    })
    .addAnswer(
        '',
        { capture: true },
        async (ctx, { flowDynamic, state }) => {
            if (!state.get('option')) return

            const text = ctx.body.trim().toLowerCase()

            const isYes = text === 'si'
            const isNo = text === 'no'

            if (!isYes && !isNo) {
                await flowDynamic('Por favor responde *si* o *no*.')
            }

            if (isYes) {
                await flowDynamic('👨‍💻 Perfecto, un agente te contactará pronto.')
            } else {
                await flowDynamic('👌 Entendido. Si necesitas algo más, escribe *soporte*.')
            }

            await state.clear()
        }
    )

const saludoFlow = addKeyword<Provider, Database>([
    'hola', 'holaa', 'holaaa',
    'buenas', 'buenos días', 'buen dia',
    'buenas tardes', 'buenas noches',
    'hey', 'que tal', 'saludos'
])
.addAnswer(
    '¡Hola! 👋 ¿Necesitas ayuda con algo?',
    null,
    async (_, { gotoFlow, state }) => {
        // Verificar si el flujo ya fue activado
        const inFlow = state.get('inFlow');  // Estado que indica si estamos en un flujo

        if (inFlow) {
            console.log('Ya estás en un flujo, no redirigiendo.');
            return;  // Si estamos en un flujo, no hacemos nada
        }

        // Si no estamos en un flujo, redirigir al flujo de soporte
        console.log('Redirigiendo al flujo de soporte');
        await state.update({ inFlow: true });  // Marcar que ahora estamos en un flujo
        return gotoFlow(supportMainFlow);  // Redirigir al flujo principal de soporte
    }
);

// Main bot
const main = async () => {
    const adapterFlow = createFlow([
        saludoFlow,
        supportMainFlow,
        noAbreSistemaFlow,
        licenciaFlow,
        portalFlow,
        cotizacionFlow,
        otroProblemaFlow,
        resumenFlow
    ])

    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.jwtToken,
        numberId: process.env.numberId,
        verifyToken: process.env.verifyToken,
        version: 'v22.0'
    })

    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    httpServer(+PORT)
}

main()
