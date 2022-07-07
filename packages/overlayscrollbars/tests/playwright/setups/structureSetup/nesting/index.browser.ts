import './index.scss';
import 'styles/overlayscrollbars.scss';
import should from 'should';
import { OverlayScrollbars } from 'overlayscrollbars';
import { resize } from '@/testing-browser/Resize';
import { timeout } from '@/testing-browser/timeout';
import { setTestResult, waitForOrFailTest } from '@/testing-browser/TestResult';
import { addClass, each, isArray, removeAttr, style } from 'support';

OverlayScrollbars.env().setDefaultOptions({
  nativeScrollbarsOverlaid: { initialize: true },
});

const startBtn: HTMLButtonElement | null = document.querySelector('#start');
const targetRoot: HTMLElement | null = document.querySelector('#targetRoot');
const targetA: HTMLElement | null = document.querySelector('#targetA');
const targetB: HTMLElement | null = document.querySelector('#targetB');
const updatesRootSlot: HTMLElement | null = document.querySelector('#updatesRoot');
const updatesASlot: HTMLElement | null = document.querySelector('#updatesA');
const updatesBSlot: HTMLElement | null = document.querySelector('#updatesB');
const resizeRoot: HTMLElement | null = document.querySelector('#resizeRoot');
const resizeA: HTMLElement | null = document.querySelector('#resizeA');
const resizeB: HTMLElement | null = document.querySelector('#resizeB');
const resizeBetweenRoot: HTMLElement | null = document.createElement('div');
const resizeBetweenA: HTMLElement | null = document.createElement('div');
const resizeBetweenB: HTMLElement | null = document.createElement('div');

let rootUpdateCount = 0;
let aUpdateCount = 0;
let bUpdateCount = 0;
const rootInstance = OverlayScrollbars(
  { target: targetRoot!, padding: true },
  {},
  {
    initialized() {
      requestAnimationFrame(() => {
        addClass(rootInstance.elements().content, 'flex');
        addClass(resizeBetweenRoot, 'resize resizeBetween');
        targetRoot!.append(resizeBetweenRoot);
      });
    },
    updated() {
      rootUpdateCount++;
      requestAnimationFrame(() => {
        if (updatesRootSlot) {
          updatesRootSlot.textContent = `${rootUpdateCount}`;
        }
      });
    },
  }
);
const aInstance = OverlayScrollbars(
  { target: targetA!, content: true },
  {},
  {
    initialized() {
      requestAnimationFrame(() => {
        addClass(aInstance.elements().content, 'flex');
        addClass(resizeBetweenA, 'resize resizeBetween');
        targetA!.append(resizeBetweenA);
      });
    },
    updated() {
      aUpdateCount++;
      requestAnimationFrame(() => {
        if (updatesASlot) {
          updatesASlot.textContent = `${aUpdateCount}`;
        }
      });
    },
  }
);
const bInstance = OverlayScrollbars(
  targetB!,
  {},
  {
    initialized() {
      addClass(resizeBetweenB, 'resize resizeBetween');
      targetB!.append(resizeBetweenB);
    },
    updated() {
      bUpdateCount++;
      requestAnimationFrame(() => {
        if (updatesBSlot) {
          updatesBSlot.textContent = `${bUpdateCount}`;
        }
      });
    },
  }
);

resize(resizeRoot!);
resize(resizeA!);
resize(resizeB!);
resize(resizeBetweenRoot!);
resize(resizeBetweenA!);
resize(resizeBetweenB!);

const resizeBetween = async (betweenElm: HTMLElement) => {
  const styleObj = {
    width: parseInt(style(betweenElm, 'width'), 10) + 50,
    height: parseInt(style(betweenElm, 'height'), 10) + 50,
  };
  const updateCountsBefore = [rootUpdateCount, aUpdateCount, bUpdateCount];
  style(betweenElm, styleObj);

  await timeout(250);
  const updateCountsAfter = [rootUpdateCount, aUpdateCount, bUpdateCount];

  should.equal(
    JSON.stringify(updateCountsBefore),
    JSON.stringify(updateCountsAfter),
    `Resizing a between element shouldn't trigger any updates.`
  );
  removeAttr(betweenElm, 'style');
};

const resizeResize = async (resizeElm: HTMLElement) => {
  const styleObj = {
    width: parseInt(style(resizeElm, 'width'), 10) - 10,
    height: parseInt(style(resizeElm, 'height'), 10) - 10,
  };
  const updateCountsBefore = [rootUpdateCount, aUpdateCount, bUpdateCount];
  style(resizeElm, styleObj);

  await timeout(250);
  const updateCountsAfter = [rootUpdateCount, aUpdateCount, bUpdateCount];

  should.equal(
    JSON.stringify(updateCountsBefore),
    JSON.stringify(updateCountsAfter),
    `Non size changing mutations shouldn't trigger any updates.`
  );
  removeAttr(resizeElm, 'style');
};

const overwriteScrollHeight = (elm: HTMLElement | HTMLElement[]) => {
  const elements = isArray(elm) ? elm : [elm];

  each(elements, (currElm) => {
    Object.defineProperty(currElm, 'scrollHeight', {
      configurable: true,
      get() {
        setTestResult(false);
        throw new Error('accessed scrollHeight');
      },
    });
  });
};

const testBetweenElements = async () => {
  overwriteScrollHeight([
    rootInstance.elements().viewport,
    aInstance.elements().viewport,
    bInstance.elements().viewport,
  ]);
  await waitForOrFailTest(async () => {
    await resizeBetween(resizeBetweenRoot);
    await resizeBetween(resizeBetweenA);
    await resizeBetween(resizeBetweenB);
  });
};

const testResizeElements = async () => {
  await waitForOrFailTest(async () => {
    await resizeResize(resizeRoot!);
    await resizeResize(resizeA!);
    await resizeResize(resizeB!);
  });
};

const start = async () => {
  setTestResult(null);

  await testResizeElements();
  await testBetweenElements(); // has to be last

  setTestResult(true);
};

startBtn?.addEventListener('click', start);
