import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'

import { prisma } from '@/lib/prisma'

import { BadRquestError } from '../_errors/bad-request-error'

export async function authencateWithGithub(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/sessions/github',
    {
      schema: {
        tags: ['auth'],
        summary: 'Authenticate with GitHub',
        body: z.object({
          code: z.string(),
        }),
        response: {
          201: z.object({
            token: z.string(),
          }),
        },
      },
    },
    async (request, response) => {
      const { code } = request.body

      const githubOAuthURL = new URL(
        'https://github.com/login/oauth/access_token',
      )

      githubOAuthURL.searchParams.set('client_id', 'Ov23liQlEv3pUkgy8gq5')

      githubOAuthURL.searchParams.set(
        'client_secret',
        '11a05ef3febf99e929d29ae298804d239b0eb334',
      )

      githubOAuthURL.searchParams.set(
        'redirect_uri',
        'https://localhost:3000/api/auth/callback',
      )

      githubOAuthURL.searchParams.set('code', code)

      const githubAcessTokenResponse = await fetch(githubOAuthURL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      })

      const githubAcessTokenData = await githubAcessTokenResponse.json()

      const { access_token: githubAcessToken } = z
        .object({
          access_token: z.string(),
          token_type: z.literal('bearer'),
          scope: z.string(),
        })
        .parse(githubAcessTokenData)

      const githubUserResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${githubAcessToken}`,
        },
      })

      const githubUserData = await githubUserResponse.json()

      const {
        id: githubId,
        name,
        email,
        avatar_url: avatarUrl,
      } = z
        .object({
          id: z.number().int().transform(String),
          name: z.string().nullable(),
          email: z.string().email().nullable(),
          avatar_url: z.string().url(),
        })
        .parse(githubUserData)

      if (email === null) {
        throw new BadRquestError(
          'Your github account must have an email to authenticate.',
        )
      }

      let user = await prisma.user.findUnique({
        where: { email },
      })

      if (!user) {
        user = await prisma.user.create({
          data: {
            name,
            email,
            avatarUrl,
          },
        })

        let account = await prisma.account.findUnique({
          where: {
            provider_userId: {
              provider: 'GITHUB',
              userId: user.id,
            },
          },
        })

        if (!account) {
          account = await prisma.account.create({
            data: {
              provider: 'GITHUB',
              providerAccountId: githubId,
              userId: user.id,
            },
          })
        }

        const token = await response.jwtSign(
          {
            sub: user.id,
          },
          {
            sign: {
              expiresIn: '7d',
            },
          },
        )

        return response.status(201).send({ token })
      }
    },
  )
}
