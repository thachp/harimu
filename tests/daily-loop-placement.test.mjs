import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
test('full daily guidance is mounted once in City, not inside location panels',()=>{
 const mounts=[];const visit=node=>{if(ts.isJsxExpression(node)&&node.expression&&ts.isIdentifier(node.expression)&&node.expression.text==='dailyLoop') mounts.push(node);ts.forEachChild(node,visit);};visit(tree);
 assert.equal(mounts.length,1);
 const sceneStart=source.indexOf('const citizenScene =');const sceneEnd=source.indexOf('const worldPanel =');
 assert.doesNotMatch(source.slice(sceneStart,sceneEnd),/\{dailyLoop\}|\{firstLoopHint\}/);
});
