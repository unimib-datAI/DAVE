export type Translation = {
  infer: {
    toolbar: {
      browseDocs: string;
      logout: string;
    };
    subTitle: string;
    nWords: string;
    selectAnnotationSet: string;
    computeBtn: string;
  };
  documents: {
    toolbar: {
      searchInput: string;
      logout: string;
    };
    modals: {
      searchInput: string;
      noResults: string;
    };
    addCard: {
      title: string;
      subTitle: string;
    };
    title: string;
  };
  document: {
    toolbar: {
      save: string;
      saving: string;
      saved: string;
      retry: string;
      saveError: string;
      lastSaved: string;
      justNow: string;
      minuteAgo: string;
      minutesAgo: string;
      hourAgo: string;
      hoursAgo: string;
      dayAgo: string;
      daysAgo: string;
      lastSavedAt: string;
      savingTooltip: string;
      savedTooltip: string;
      errorTooltip: string;
      unsavedChanges: string;
      logout: string;
    };
    subToolbar: {
      anonimize: string;
      deAnonimize: string;
      annotationSet: {
        label: string;
        new: string;
      };
      types: {
        label: string;
      };
    };
    leftSidebar: {
      actionsTooltips: {
        select: string;
        add: string;
        delete: string;
        clusters: string;
        filter: string;
        settings: string;
        data: string;
      };
      addContent: {
        title: string;
        description: string;
        addType: string;
        loadTaxonomy: string;
        tooltipNotRecognized: string;
      };
      clustersContent: {
        alphabeticalOrder: string;
        mentionOrder: string;
        title: string;
        description: string;
        mentions: string;
        edit: string;
      };
      metadataContent: {
        title: string;
        description: string;
      };
    };
    rightSidebar: {
      title: string;
      description: string;
      entityContext: string;
      typeHierarchy: string;
      links: string;
      emptyLinks: string;
      editBtn: string;
    };
    modals: {
      addType: {
        title: string;
        description: string;
        typeNameInput: string;
        tagInput: string;
        subClassOf: string;
        parentTypeInput: string;
        btnConfirm: string;
        btnCancel: string;
      };
      addAnnotationSet: {
        title: string;
        description: string;
        nameInput: string;
        presetInput: string;
      };
      editAnnotation: {
        title: string;
        context: string;
        type: string;
        typeDescription: string;
        links: string;
        linksDescription: string;
        searchLink: string;
        addCandidate: {
          btn: string;
          title: string;
          description: string;
          resourceLink: string;
          candidateTitle: string;
          candidateDescription: string;
          add: string;
        };
        btnConfirm: string;
        btnCancel: string;
      };
    };
  };
};
