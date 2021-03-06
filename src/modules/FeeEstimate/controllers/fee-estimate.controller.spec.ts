// Copyright (C) Atlas City Global <https://atlascity.io>
// This file is part of cryptowallet-api <https://github.com/atlascity/cryptowallet-api>.
//
// cryptowallet-api is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 2 of the License, or
// (at your option) any later version.
//
// cryptowallet-api is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with cryptowallet-api.  If not, see <http://www.gnu.org/licenses/>.

import * as request from 'supertest';
import envConfig from '../../../config/envConfig';
import MongoMemoryServer from 'mongodb-memory-server';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FeeEstimateController } from './fee-estimate.controller';
import { FeeEstimateService } from '../fee-estimate.service';
import { FeeEstimateModule } from '../fee-estimate.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '../../../config/config.module';
import { ConfigService } from '../../../config/config.service';
import { AuthModule } from '../../Auth/auth.module';

describe('FeeEstimateController', () => {
  let app: INestApplication;
  let mongoServer;
  let feeEstimateService;
  let configService;
  let token;

  beforeEach(async () => {
    mongoServer = new MongoMemoryServer();
    const mongoUri = await mongoServer.getConnectionString();

    const module = await Test.createTestingModule({
      imports: [
        AuthModule,
        ConfigModule,
        MongooseModule.forRoot(mongoUri, { useNewUrlParser: true }),
        FeeEstimateModule,
      ],
      controllers: [FeeEstimateController],
      providers: [FeeEstimateService],
    }).compile();

    feeEstimateService = module.get<FeeEstimateService>(FeeEstimateService);
    configService = module.get<ConfigService>(ConfigService);

    app = module.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer()).get('/auth/token/:fee');
    token = response.body.accessToken;
  });

  describe('/fee-estimate/:coin', () => {
    describe('validates parameters before passing the request to the controller', () => {
      it('responds with 200 and JSON when called with a single parameter', async (done) => {
        return request(app.getHttpServer())
          .get('/fee-estimate/BTC')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
          .expect('Content-Type', /json/)
          .then((response) => {
            done();
          });

      });

      it('responds with 422 when called with invalid coin parameter', async (done) => {
        return request(app.getHttpServer())
          .get('/fee-estimate/BTC1')
          .set('Authorization', `Bearer ${token}`)
          .expect(422)
          .then((response) => {
            done();
          });
      });
    });

    describe('processes the request correctly', () => {
      it('denies access if called without a token', async (done) => {
        return request(app.getHttpServer())
          .get('/fee-estimate/BTC')
          .expect(401)
          .expect('Content-Type', /json/)
          .then((response) => {
            expect(response.body.message).toBe('Unauthorized. No auth token');
            done();
          });
      });

      it('fetches the data from the external API and caches it in the DB, responds', async (done) => {
        return request(app.getHttpServer())
          .get('/fee-estimate/BTC')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
          .then(async (response) => {
            expect(response.body.code).toBe('BTC');

            const feeEstimateData = await feeEstimateService.findAll();
            expect(feeEstimateData.length).toBe(1);

            const feeEstimateDataBTC = await feeEstimateService.findOne({ code: 'BTC' });
            expect(feeEstimateDataBTC.code).toBe('BTC');

            done();
          });
      });

      it('uses cached data on subsequent requests', async (done) => {
        let timestamp;

        return request(app.getHttpServer())
          .get('/fee-estimate/LTC')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
          .then((response) => {
            expect(response.body.code).toBe('LTC');
            timestamp = response.body.timestamp;
          })
          .then(() => {
            request(app.getHttpServer())
              .get('/fee-estimate/LTC')
              .set('Authorization', `Bearer ${token}`)
              .expect(200)
              .then((response) => {
                expect(response.body.timestamp === timestamp).toBe(true);
                done();
              });
          });
      });

      it('responds with 500 when called with valid but non existing coin code', async (done) => {
        return request(app.getHttpServer())
          .get('/fee-estimate/BTCBTC')
          .set('Authorization', `Bearer ${token}`)
          .expect(500)
          .then((response) => {
            done();
          });
      });
    });
  });

  afterAll(async () => {
    mongoServer.stop();
    await app.close();
  });
});
