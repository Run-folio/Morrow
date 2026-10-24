import test from 'node:test';
import {proveSuccessfulContract} from './helpers/successful-transfer-fixture.ts';
test('offline response passes actual API guard and client with successful changed leg',async t=>{t.diagnostic(JSON.stringify(await proveSuccessfulContract()));});
