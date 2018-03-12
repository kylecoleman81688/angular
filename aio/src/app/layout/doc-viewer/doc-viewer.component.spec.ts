import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title, Meta } from '@angular/platform-browser';

import { Observable } from 'rxjs/Observable';
import { of } from 'rxjs/observable/of';

import { FILE_NOT_FOUND_ID, FETCHING_ERROR_ID } from 'app/documents/document.service';
import { EmbedComponentsService } from 'app/embed-components/embed-components.service';
import { Logger } from 'app/shared/logger.service';
import { TocService } from 'app/shared/toc.service';
import {
  MockEmbedComponentsService, MockTitle, MockTocService, ObservableWithSubscriptionSpies,
  TestDocViewerComponent, TestModule, TestParentComponent
} from 'testing/doc-viewer-utils';
import { MockLogger } from 'testing/logger.service';
import { DocViewerComponent, NO_ANIMATIONS } from './doc-viewer.component';


describe('DocViewerComponent', () => {
  let parentFixture: ComponentFixture<TestParentComponent>;
  let parentComponent: TestParentComponent;
  let docViewerEl: HTMLElement;
  let docViewer: TestDocViewerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule]
    });

    parentFixture = TestBed.createComponent(TestParentComponent);
    parentComponent = parentFixture.componentInstance;

    parentFixture.detectChanges();

    docViewerEl = parentFixture.debugElement.children[0].nativeElement;
    docViewer = parentComponent.docViewer as any;
  });

  it('should create a `DocViewer`', () => {
    expect(docViewer).toEqual(jasmine.any(DocViewerComponent));
  });

  describe('#doc', () => {
    let renderSpy: jasmine.Spy;

    const setCurrentDoc = (contents: string|null, id = 'fizz/buzz') => {
      parentComponent.currentDoc = {contents, id};
      parentFixture.detectChanges();
    };

    beforeEach(() => renderSpy = spyOn(docViewer, 'render').and.returnValue([null]));

    it('should render the new document', () => {
      setCurrentDoc('foo', 'bar');
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy.calls.mostRecent().args).toEqual([{id: 'bar', contents: 'foo'}]);

      setCurrentDoc(null, 'baz');
      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy.calls.mostRecent().args).toEqual([{id: 'baz', contents: null}]);
    });

    it('should unsubscribe from the previous "render" observable upon new document', () => {
      const obs = new ObservableWithSubscriptionSpies();
      renderSpy.and.returnValue(obs);

      setCurrentDoc('foo', 'bar');
      expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
      expect(obs.unsubscribeSpies[0]).not.toHaveBeenCalled();

      setCurrentDoc('baz', 'qux');
      expect(obs.subscribeSpy).toHaveBeenCalledTimes(2);
      expect(obs.unsubscribeSpies[0]).toHaveBeenCalledTimes(1);
    });

    it('should ignore falsy document values', () => {
      parentComponent.currentDoc = null;
      parentFixture.detectChanges();

      expect(renderSpy).not.toHaveBeenCalled();

      parentComponent.currentDoc = undefined;
      parentFixture.detectChanges();

      expect(renderSpy).not.toHaveBeenCalled();
    });
  });

  describe('#ngDoCheck()', () => {
    let componentInstances: ComponentRef<any>[];

    beforeEach(() => {
      componentInstances = [
        {changeDetectorRef: {detectChanges: jasmine.createSpy('detectChanges')}},
        {changeDetectorRef: {detectChanges: jasmine.createSpy('detectChanges')}},
        {changeDetectorRef: {detectChanges: jasmine.createSpy('detectChanges')}},
      ] as any;
      docViewer.embeddedComponentRefs.push(...componentInstances);
    });

    afterEach(() => {
      // Clean up the fake component instances, to avoid error in `ngOnDestroy()`.
      docViewer.embeddedComponentRefs = [];
    });

    it('should detect changes on each active component instance', () => {
      parentFixture.detectChanges();
      componentInstances.forEach(({changeDetectorRef: cd}) => {
        expect(cd.detectChanges).toHaveBeenCalledTimes(1);
      });

      parentFixture.detectChanges();
      componentInstances.forEach(({changeDetectorRef: cd}) => {
        expect(cd.detectChanges).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('#ngOnDestroy()', () => {
    it('should destroy the active embedded component instances', () => {
      const destroyEmbeddedComponentsSpy = spyOn(docViewer, 'destroyEmbeddedComponents');
      docViewer.ngOnDestroy();

      expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledTimes(1);
    });

    it('should stop responding to document changes', () => {
      const renderSpy = spyOn(docViewer, 'render').and.returnValue([undefined]);

      expect(renderSpy).not.toHaveBeenCalled();

      docViewer.doc = {contents: 'Some content', id: 'some-id'};
      expect(renderSpy).toHaveBeenCalledTimes(1);

      docViewer.ngOnDestroy();

      docViewer.doc = {contents: 'Other content', id: 'other-id'};
      expect(renderSpy).toHaveBeenCalledTimes(1);

      docViewer.doc = {contents: 'More content', id: 'more-id'};
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('#destroyEmbeddedComponents()', () => {
    let componentInstances: ComponentRef<any>[];

    beforeEach(() => {
      componentInstances = [
        {destroy: jasmine.createSpy('destroy#1')},
        {destroy: jasmine.createSpy('destroy#2')},
        {destroy: jasmine.createSpy('destroy#3')},
      ] as any;
      docViewer.embeddedComponentRefs.push(...componentInstances);
    });

    it('should destroy each active component instance', () => {
      docViewer.destroyEmbeddedComponents();

      expect(componentInstances.length).toBe(3);
      componentInstances.forEach(comp => expect(comp.destroy).toHaveBeenCalledTimes(1));
    });

    it('should clear the list of active component instances', () => {
      expect(docViewer.embeddedComponentRefs.length).toBeGreaterThan(0);

      docViewer.destroyEmbeddedComponents();
      expect(docViewer.embeddedComponentRefs.length).toBe(0);
    });
  });

  describe('#prepareTitleAndToc()', () => {
    const EMPTY_DOC = '';
    const DOC_WITHOUT_H1 = 'Some content';
    const DOC_WITH_H1 = '<h1>Features</h1>Some content';
    const DOC_WITH_NO_TOC_H1 = '<h1 class="no-toc">Features</h1>Some content';
    const DOC_WITH_EMBEDDED_TOC = '<h1>Features</h1><aio-toc class="embedded"></aio-toc>Some content';
    const DOC_WITH_EMBEDDED_TOC_WITHOUT_H1 = '<aio-toc class="embedded"></aio-toc>Some content';
    const DOC_WITH_EMBEDDED_TOC_WITH_NO_TOC_H1 = '<aio-toc class="embedded"></aio-toc>Some content';
    const DOC_WITH_HIDDEN_H1_CONTENT = '<h1><i style="visibility: hidden">link</i>Features</h1>Some content';
    let titleService: MockTitle;
    let tocService: MockTocService;
    let targetEl: HTMLElement;

    const getTocEl = () => targetEl.querySelector('aio-toc');
    const doPrepareTitleAndToc = (contents: string, docId = '') => {
      targetEl.innerHTML = contents;
      return docViewer.prepareTitleAndToc(targetEl, docId);
    };
    const doAddTitleAndToc = (contents: string, docId = '') => {
      const addTitleAndToc = doPrepareTitleAndToc(contents, docId);
      return addTitleAndToc();
    };

    beforeEach(() => {
      titleService = TestBed.get(Title);
      tocService = TestBed.get(TocService);

      targetEl = document.createElement('div');
      document.body.appendChild(targetEl);  // Required for `innerText` to work as expected.
    });

    afterEach(() => document.body.removeChild(targetEl));

    it('should return a function for doing the actual work', () => {
      const addTitleAndToc = doPrepareTitleAndToc(DOC_WITH_H1);

      expect(getTocEl()).toBeTruthy();
      expect(titleService.setTitle).not.toHaveBeenCalled();
      expect(tocService.reset).not.toHaveBeenCalled();
      expect(tocService.genToc).not.toHaveBeenCalled();

      addTitleAndToc();

      expect(titleService.setTitle).toHaveBeenCalledTimes(1);
      expect(tocService.reset).toHaveBeenCalledTimes(1);
      expect(tocService.genToc).toHaveBeenCalledTimes(1);
    });

    describe('(title)', () => {
      it('should set the title if there is an `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_H1);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Features');
      });

      it('should set the title if there is a `.no-toc` `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_NO_TOC_H1);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Features');
      });

      it('should set the default title if there is no `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITHOUT_H1);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular');

        doAddTitleAndToc(EMPTY_DOC);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular');
      });

      it('should not include hidden content of the `<h1>` heading in the title', () => {
        doAddTitleAndToc(DOC_WITH_HIDDEN_H1_CONTENT);
        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Features');
      });

      it('should fall back to `textContent` if `innerText` is not available', () => {
        const querySelector_ = targetEl.querySelector;
        spyOn(targetEl, 'querySelector').and.callFake((selector: string) => {
          const elem = querySelector_.call(targetEl, selector);
          return Object.defineProperties(elem, {
            innerText: {value: undefined},
            textContent: {value: 'Text Content'},
          });
        });

        doAddTitleAndToc(DOC_WITH_HIDDEN_H1_CONTENT);

        expect(titleService.setTitle).toHaveBeenCalledWith('Angular - Text Content');
      });

      it('should still use `innerText` if available but empty', () => {
        const querySelector_ = targetEl.querySelector;
        spyOn(targetEl, 'querySelector').and.callFake((selector: string) => {
          const elem = querySelector_.call(targetEl, selector);
          return Object.defineProperties(elem, {
            innerText: { value: '' },
            textContent: { value: 'Text Content' }
          });
        });

        doAddTitleAndToc(DOC_WITH_HIDDEN_H1_CONTENT);

        expect(titleService.setTitle).toHaveBeenCalledWith('Angular');
      });
    });

    describe('(ToC)', () => {
      describe('needed', () => {
        it('should add an embedded ToC element if there is an `<h1>` heading', () => {
          doPrepareTitleAndToc(DOC_WITH_H1);
          const tocEl = getTocEl()!;

          expect(tocEl).toBeTruthy();
          expect(tocEl.classList.contains('embedded')).toBe(true);
        });

        it('should not add a second ToC element if there a hard coded one in place', () => {
          doPrepareTitleAndToc(DOC_WITH_EMBEDDED_TOC);
          expect(targetEl.querySelectorAll('aio-toc').length).toEqual(1);
        });
      });


      describe('not needed', () => {
        it('should not add a ToC element if there is a `.no-toc` `<h1>` heading', () => {
          doPrepareTitleAndToc(DOC_WITH_NO_TOC_H1);
          expect(getTocEl()).toBeFalsy();
        });

        it('should not add a ToC element if there is no `<h1>` heading', () => {
          doPrepareTitleAndToc(DOC_WITHOUT_H1);
          expect(getTocEl()).toBeFalsy();

          doPrepareTitleAndToc(EMPTY_DOC);
          expect(getTocEl()).toBeFalsy();
        });

        it('should remove ToC a hard coded one', () => {
          doPrepareTitleAndToc(DOC_WITH_EMBEDDED_TOC_WITHOUT_H1);
          expect(getTocEl()).toBeFalsy();

          doPrepareTitleAndToc(DOC_WITH_EMBEDDED_TOC_WITH_NO_TOC_H1);
          expect(getTocEl()).toBeFalsy();
        });
      });


      it('should generate ToC entries if there is an `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_H1, 'foo');

        expect(tocService.genToc).toHaveBeenCalledTimes(1);
        expect(tocService.genToc).toHaveBeenCalledWith(targetEl, 'foo');
      });

      it('should not generate ToC entries if there is a `.no-toc` `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITH_NO_TOC_H1);
        expect(tocService.genToc).not.toHaveBeenCalled();
      });

      it('should not generate ToC entries if there is no `<h1>` heading', () => {
        doAddTitleAndToc(DOC_WITHOUT_H1);
        doAddTitleAndToc(EMPTY_DOC);

        expect(tocService.genToc).not.toHaveBeenCalled();
      });

      it('should always reset the ToC (before generating the new one)', () => {
        doAddTitleAndToc(DOC_WITH_H1, 'foo');
        expect(tocService.reset).toHaveBeenCalledTimes(1);
        expect(tocService.reset).toHaveBeenCalledBefore(tocService.genToc);
        expect(tocService.genToc).toHaveBeenCalledWith(targetEl, 'foo');

        tocService.genToc.calls.reset();

        doAddTitleAndToc(DOC_WITH_NO_TOC_H1, 'bar');
        expect(tocService.reset).toHaveBeenCalledTimes(2);
        expect(tocService.genToc).not.toHaveBeenCalled();

        doAddTitleAndToc(DOC_WITHOUT_H1, 'baz');
        expect(tocService.reset).toHaveBeenCalledTimes(3);
        expect(tocService.genToc).not.toHaveBeenCalled();

        doAddTitleAndToc(EMPTY_DOC, 'qux');
        expect(tocService.reset).toHaveBeenCalledTimes(4);
        expect(tocService.genToc).not.toHaveBeenCalled();
      });
    });
  });

  describe('#render()', () => {
    let destroyEmbeddedComponentsSpy: jasmine.Spy;
    let embedIntoSpy: jasmine.Spy;
    let prepareTitleAndTocSpy: jasmine.Spy;
    let swapViewsSpy: jasmine.Spy;

    const doRender = (contents: string | null, id = 'foo') =>
      new Promise<void>((resolve, reject) =>
        docViewer.render({contents, id}).subscribe(resolve, reject));

    beforeEach(() => {
      const embedComponentsService = TestBed.get(EmbedComponentsService) as MockEmbedComponentsService;

      destroyEmbeddedComponentsSpy = spyOn(docViewer, 'destroyEmbeddedComponents');
      embedIntoSpy = embedComponentsService.embedInto.and.returnValue(of([]));
      prepareTitleAndTocSpy = spyOn(docViewer, 'prepareTitleAndToc');
      swapViewsSpy = spyOn(docViewer, 'swapViews').and.returnValue(of(undefined));
    });

    it('should return an `Observable`', () => {
      expect(docViewer.render({contents: '', id: ''})).toEqual(jasmine.any(Observable));
    });

    describe('(contents, title, ToC)', () => {
      beforeEach(() => swapViewsSpy.and.callThrough());

      it('should display the document contents', async () => {
        const contents = '<h1>Hello,</h1> <div>world!</div>';
        await doRender(contents);

        expect(docViewerEl.innerHTML).toContain(contents);
        expect(docViewerEl.textContent).toBe('Hello, world!');
      });

      it('should display nothing if the document has no contents', async () => {
        await doRender('Test');
        expect(docViewerEl.textContent).toBe('Test');

        await doRender('');
        expect(docViewerEl.textContent).toBe('');

        docViewer.currViewContainer.innerHTML = 'Test';
        expect(docViewerEl.textContent).toBe('Test');

        await doRender(null);
        expect(docViewerEl.textContent).toBe('');
      });

      it('should prepare the title and ToC (before embedding components)', async () => {
        prepareTitleAndTocSpy.and.callFake((targetEl: HTMLElement, docId: string) => {
          expect(targetEl.innerHTML).toBe('Some content');
          expect(docId).toBe('foo');
        });

        await doRender('Some content', 'foo');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(prepareTitleAndTocSpy).toHaveBeenCalledBefore(embedIntoSpy);
      });

      it('should set the title and ToC (after the content has been set)', async () => {
        const addTitleAndTocSpy = jasmine.createSpy('addTitleAndToc');
        prepareTitleAndTocSpy.and.returnValue(addTitleAndTocSpy);

        addTitleAndTocSpy.and.callFake(() => expect(docViewerEl.textContent).toBe('Foo content'));
        await doRender('Foo content');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(1);

        addTitleAndTocSpy.and.callFake(() => expect(docViewerEl.textContent).toBe('Bar content'));
        await doRender('Bar content');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(2);

        addTitleAndTocSpy.and.callFake(() => expect(docViewerEl.textContent).toBe(''));
        await doRender('');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(3);

        addTitleAndTocSpy.and.callFake(() => expect(docViewerEl.textContent).toBe('Qux content'));
        await doRender('Qux content');
        expect(addTitleAndTocSpy).toHaveBeenCalledTimes(4);
      });

      it('should remove "noindex" meta tags if the document is valid', async () => {
        await doRender('foo', 'bar');
        expect(TestBed.get(Meta).removeTag).toHaveBeenCalledWith('name="googlebot"');
        expect(TestBed.get(Meta).removeTag).toHaveBeenCalledWith('name="robots"');
      });

      it('should add "noindex" meta tags if the document is 404', async () => {
        await doRender('missing', FILE_NOT_FOUND_ID);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('should add "noindex" meta tags if the document fetching fails', async () => {
        await doRender('error', FETCHING_ERROR_ID);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });
    });

    describe('(embedding components)', () => {
      it('should embed components', async () => {
        await doRender('Some content');
        expect(embedIntoSpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).toHaveBeenCalledWith(docViewer.nextViewContainer);
      });

      it('should attempt to embed components even if the document is empty', async () => {
        await doRender('');
        await doRender(null);

        expect(embedIntoSpy).toHaveBeenCalledTimes(2);
        expect(embedIntoSpy.calls.argsFor(0)).toEqual([docViewer.nextViewContainer]);
        expect(embedIntoSpy.calls.argsFor(1)).toEqual([docViewer.nextViewContainer]);
      });

      it('should store the embedded components', async () => {
        const embeddedComponents: ComponentRef<any>[] = [];
        embedIntoSpy.and.returnValue(of(embeddedComponents));

        await doRender('Some content');

        expect(docViewer.embeddedComponentRefs).toBe(embeddedComponents);
      });

      it('should unsubscribe from the previous "embed" observable when unsubscribed from', () => {
        const obs = new ObservableWithSubscriptionSpies();
        embedIntoSpy.and.returnValue(obs);

        const renderObservable = docViewer.render({contents: 'Some content', id: 'foo'});
        const subscription = renderObservable.subscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).not.toHaveBeenCalled();

        subscription.unsubscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).toHaveBeenCalledTimes(1);
      });
    });

    describe('(destroying old embedded components)', () => {
      it('should destroy old embedded components after creating new embedded components', async () => {
        await doRender('<div></div>');

        expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).toHaveBeenCalledBefore(destroyEmbeddedComponentsSpy);
      });

      it('should still destroy old embedded components if the new document is empty', async () => {
        await doRender('');
        expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledTimes(1);

        await doRender(null);
        expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledTimes(2);
      });
    });

    describe('(swapping views)', () => {
      it('should swap the views after destroying old embedded components', async () => {
        await doRender('<div></div>');

        expect(swapViewsSpy).toHaveBeenCalledTimes(1);
        expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledBefore(swapViewsSpy);
      });

      it('should still swap the views if the document is empty', async () => {
        await doRender('');
        expect(swapViewsSpy).toHaveBeenCalledTimes(1);

        await doRender(null);
        expect(swapViewsSpy).toHaveBeenCalledTimes(2);
      });

      it('should pass the `addTitleAndToc` callback', async () => {
        const addTitleAndTocSpy = jasmine.createSpy('addTitleAndToc');
        prepareTitleAndTocSpy.and.returnValue(addTitleAndTocSpy);

        await doRender('<div></div>');

        expect(swapViewsSpy).toHaveBeenCalledWith(addTitleAndTocSpy);
      });

      it('should unsubscribe from the previous "swap" observable when unsubscribed from', () => {
        const obs = new ObservableWithSubscriptionSpies();
        swapViewsSpy.and.returnValue(obs);

        const renderObservable = docViewer.render({contents: 'Hello, world!', id: 'foo'});
        const subscription = renderObservable.subscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).not.toHaveBeenCalled();

        subscription.unsubscribe();

        expect(obs.subscribeSpy).toHaveBeenCalledTimes(1);
        expect(obs.unsubscribeSpies[0]).toHaveBeenCalledTimes(1);
      });
    });

    describe('(on error) should clean up, log the error and recover', () => {
      let logger: MockLogger;

      beforeEach(() => logger = TestBed.get(Logger));

      it('when `prepareTitleAndTocSpy()` fails', async () => {
        const error = Error('Typical `prepareTitleAndToc()` error');
        prepareTitleAndTocSpy.and.callFake(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'foo');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).not.toHaveBeenCalled();
        expect(destroyEmbeddedComponentsSpy).not.toHaveBeenCalled();
        expect(swapViewsSpy).not.toHaveBeenCalled();
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [jasmine.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'foo': ${error.stack}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when `EmbedComponentsService.embedInto()` fails', async () => {
        const error = Error('Typical `embedInto()` error');
        embedIntoSpy.and.callFake(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'bar');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).toHaveBeenCalledTimes(1);
        expect(destroyEmbeddedComponentsSpy).not.toHaveBeenCalled();
        expect(swapViewsSpy).not.toHaveBeenCalled();
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [jasmine.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'bar': ${error.stack}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when `destroyEmbeddedComponents()` fails', async () => {
        const error = Error('Typical `destroyEmbeddedComponents()` error');
        destroyEmbeddedComponentsSpy.and.callFake(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'baz');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).toHaveBeenCalledTimes(1);
        expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledTimes(1);
        expect(swapViewsSpy).not.toHaveBeenCalled();
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [jasmine.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'baz': ${error.stack}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when `swapViews()` fails', async () => {
        const error = Error('Typical `swapViews()` error');
        swapViewsSpy.and.callFake(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'qux');

        expect(prepareTitleAndTocSpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).toHaveBeenCalledTimes(1);
        expect(destroyEmbeddedComponentsSpy).toHaveBeenCalledTimes(1);
        expect(swapViewsSpy).toHaveBeenCalledTimes(1);
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [jasmine.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'qux': ${error.stack}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });

      it('when something fails with non-Error', async () => {
        const error = 'Typical string error';
        swapViewsSpy.and.callFake(() => {
          expect(docViewer.nextViewContainer.innerHTML).not.toBe('');
          throw error;
        });

        await doRender('Some content', 'qux');

        expect(swapViewsSpy).toHaveBeenCalledTimes(1);
        expect(docViewer.nextViewContainer.innerHTML).toBe('');
        expect(logger.output.error).toEqual([
          [jasmine.any(Error)]
        ]);
        expect(logger.output.error[0][0].message).toEqual(`[DocViewer] Error preparing document 'qux': ${error}`);
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'googlebot', content: 'noindex' });
        expect(TestBed.get(Meta).addTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex' });
      });
    });

    describe('(events)', () => {
      it('should emit `docReady` after embedding components', async () => {
        const onDocReadySpy = jasmine.createSpy('onDocReady');
        docViewer.docReady.subscribe(onDocReadySpy);

        await doRender('Some content');

        expect(onDocReadySpy).toHaveBeenCalledTimes(1);
        expect(embedIntoSpy).toHaveBeenCalledBefore(onDocReadySpy);
      });

      it('should emit `docReady` before destroying old embedded components and swapping views', async () => {
        const onDocReadySpy = jasmine.createSpy('onDocReady');
        docViewer.docReady.subscribe(onDocReadySpy);

        await doRender('Some content');

        expect(onDocReadySpy).toHaveBeenCalledTimes(1);
        expect(onDocReadySpy).toHaveBeenCalledBefore(destroyEmbeddedComponentsSpy);
        expect(onDocReadySpy).toHaveBeenCalledBefore(swapViewsSpy);
      });

      it('should emit `docRendered` after swapping views', async () => {
        const onDocRenderedSpy = jasmine.createSpy('onDocRendered');
        docViewer.docRendered.subscribe(onDocRenderedSpy);

        await doRender('Some content');

        expect(onDocRenderedSpy).toHaveBeenCalledTimes(1);
        expect(swapViewsSpy).toHaveBeenCalledBefore(onDocRenderedSpy);
      });
    });
  });

  describe('#swapViews()', () => {
    let oldCurrViewContainer: HTMLElement;
    let oldNextViewContainer: HTMLElement;

    const doSwapViews = (cb?: () => void) =>
      new Promise<void>((resolve, reject) =>
        docViewer.swapViews(cb).subscribe(resolve, reject));

    beforeEach(() => {
      oldCurrViewContainer = docViewer.currViewContainer;
      oldNextViewContainer = docViewer.nextViewContainer;

      oldCurrViewContainer.innerHTML = 'Current view';
      oldNextViewContainer.innerHTML = 'Next view';

      docViewerEl.appendChild(oldCurrViewContainer);

      expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
      expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);
    });

    [true, false].forEach(animationsEnabled => {
      describe(`(animationsEnabled: ${animationsEnabled})`, () => {
        beforeEach(() => DocViewerComponent.animationsEnabled = animationsEnabled);
        afterEach(() => DocViewerComponent.animationsEnabled = true);

        [true, false].forEach(noAnimations => {
          describe(`(.${NO_ANIMATIONS}: ${noAnimations})`, () => {
            beforeEach(() => docViewerEl.classList[noAnimations ? 'add' : 'remove'](NO_ANIMATIONS));

            it('should return an observable', (done: DoneFn) => {
              docViewer.swapViews().subscribe(done, done.fail);
            });

            it('should swap the views', async () => {
              await doSwapViews();

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
              expect(docViewer.currViewContainer).toBe(oldNextViewContainer);
              expect(docViewer.nextViewContainer).toBe(oldCurrViewContainer);

              await doSwapViews();

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);
              expect(docViewer.currViewContainer).toBe(oldCurrViewContainer);
              expect(docViewer.nextViewContainer).toBe(oldNextViewContainer);
            });

            it('should emit `docRemoved` after removing the leaving view', async () => {
              const onDocRemovedSpy = jasmine.createSpy('onDocRemoved').and.callFake(() => {
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);
              });

              docViewer.docRemoved.subscribe(onDocRemovedSpy);

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);

              await doSwapViews();

              expect(onDocRemovedSpy).toHaveBeenCalledTimes(1);
              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
            });

            it('should not emit `docRemoved` if the leaving view is already removed', async () => {
              const onDocRemovedSpy = jasmine.createSpy('onDocRemoved');

              docViewer.docRemoved.subscribe(onDocRemovedSpy);
              docViewerEl.removeChild(oldCurrViewContainer);

              await doSwapViews();

              expect(onDocRemovedSpy).not.toHaveBeenCalled();
            });

            it('should emit `docInserted` after inserting the entering view', async () => {
              const onDocInsertedSpy = jasmine.createSpy('onDocInserted').and.callFake(() => {
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
              });

              docViewer.docInserted.subscribe(onDocInsertedSpy);

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);

              await doSwapViews();

              expect(onDocInsertedSpy).toHaveBeenCalledTimes(1);
              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
            });

            it('should call the callback after inserting the entering view', async () => {
              const onInsertedCb = jasmine.createSpy('onInsertedCb').and.callFake(() => {
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
              });
              const onDocInsertedSpy = jasmine.createSpy('onDocInserted');

              docViewer.docInserted.subscribe(onDocInsertedSpy);

              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(true);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(false);

              await doSwapViews(onInsertedCb);

              expect(onInsertedCb).toHaveBeenCalledTimes(1);
              expect(onInsertedCb).toHaveBeenCalledBefore(onDocInsertedSpy);
              expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
              expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
            });

            it('should empty the previous view', async () => {
              await doSwapViews();

              expect(docViewer.currViewContainer.innerHTML).toBe('Next view');
              expect(docViewer.nextViewContainer.innerHTML).toBe('');

              docViewer.nextViewContainer.innerHTML = 'Next view 2';
              await doSwapViews();

              expect(docViewer.currViewContainer.innerHTML).toBe('Next view 2');
              expect(docViewer.nextViewContainer.innerHTML).toBe('');
            });

            if (animationsEnabled && !noAnimations) {
              // Only test this when there are animations. Without animations, the views are swapped
              // synchronously, so there is no need (or way) to abort.
              it('should abort swapping if the returned observable is unsubscribed from', async () => {
                docViewer.swapViews().subscribe().unsubscribe();
                await doSwapViews();

                // Since the first call was cancelled, only one swapping should have taken place.
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
                expect(docViewer.currViewContainer).toBe(oldNextViewContainer);
                expect(docViewer.nextViewContainer).toBe(oldCurrViewContainer);
                expect(docViewer.currViewContainer.innerHTML).toBe('Next view');
                expect(docViewer.nextViewContainer.innerHTML).toBe('');
              });
            } else {
              it('should swap views synchronously when animations are disabled', () => {
                const cbSpy = jasmine.createSpy('cb');

                docViewer.swapViews(cbSpy).subscribe();

                expect(cbSpy).toHaveBeenCalledTimes(1);
                expect(docViewerEl.contains(oldCurrViewContainer)).toBe(false);
                expect(docViewerEl.contains(oldNextViewContainer)).toBe(true);
                expect(docViewer.currViewContainer).toBe(oldNextViewContainer);
                expect(docViewer.nextViewContainer).toBe(oldCurrViewContainer);
                expect(docViewer.currViewContainer.innerHTML).toBe('Next view');
                expect(docViewer.nextViewContainer.innerHTML).toBe('');
              });
            }
          });
        });
      });
    });
  });
});
