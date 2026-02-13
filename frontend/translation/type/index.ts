export type Translation = {
  home: {
    title: string;
    subtitle: {
      document: string;
      annotation: string;
      validation: string;
      exploration: string;
    };
    buttons: {
      seeAllDocuments: string;
      uploadAnnotatedDocuments: string;
    };
    searchPlaceholder: string;
  };
  uploadModal: {
    header: string;
    anonymize: string;
    anonymizeTypesLabel: string;
    anonymizeTypesPlaceholder: string;
    anonymizeTypesHelp: string;
    tabs: {
      json: string;
      txt: string;
    };
    jsonTab: {
      dropFiles: string;
      clickSelect: string;
      description: string;
    };
    txtTab: {
      dropFiles: string;
      clickSelect: string;
      description: string;
      configLabel: string;
      configPlaceholder: string;
      configText: string;
      configActive: string;
      configDefault: string;
    };
    selectedFiles: string;
    uploading: {
      json: string;
      txt: string;
    };
    progress: string;
    complete: string;
    success: string;
    errors: string;
    buttons: {
      close: string;
      uploading: string;
      upload: string;
    };
  };

  signIn: {
    title: string;
    subtitle: string;
    errors: {
      authFailed: string;
      accessDenied: string;
      genericError: string;
    };
    button: {
      signingIn: string;
      signIn: string;
    };
    redirectMessage: string;
  };
  infer: {
    subTitle: string;
    computeBtn: string;
    nWords: string;
    toolbar: {
      browseDocs: string;
      logout: string;
    };
    selectAnnotationSet: 'Set';
  };
  documents: {
    toolbar: {
      logout: string;
      searchInput: string;
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
    editedAgo: string;
  };
  collections: {
    backToCollections: string;
    collectionDocuments: string;
    untitled: string;
    tableHeaders: {
      id: string;
      name: string;
      preview: string;
      actions: string;
    };
    noPreview: string;
    deleteDocument: string;
    deleteConfirmation: string;
    uploadAnnotatedDocuments: string;
    documentDeleted: string;
    errorDeleting: string;
    title: string;
    newCollection: string;
    emptyState: string;
    owner: string;
    download: string;
    edit: string;
    delete: string;
    deleteTitle: string;
    deleteDescription: string;
    yes: string;
    no: string;
    sharedWith: string;
    editModalTitle: string;
    newModalTitle: string;
    collectionNameLabel: string;
    collectionNamePlaceholder: string;
    shareWithUsers: string;
    cancel: string;
    update: string;
    create: string;
  };
  chat: {
    initialMessage: string;
    resources: string;
    typeQuestionPlaceholder: string;
    send: string;
    resetChat: string;
    predefinedQuestions: string;
    selectQuestion: string;
    selectPredefinedQuestionTooltip: string;
    temperature: string;
    temperatureTooltip: string;
    maxNewTokens: string;
    maxNewTokensTooltip: string;
    topP: string;
    topPTooltip: string;
    topK: string;
    topKTooltip: string;
    frequencyPenalty: string;
    frequencyPenaltyTooltip: string;
    retrievalMethod: string;
    hybridRetrieval: string;
    hybridRetrievalNoNer: string;
    dense: string;
    fullText: string;
    none: string;
    forceRag: string;
    forceRagTooltip: string;
    useMultiAgentSystem: string;
    useMultiAgentTooltip: string;
    systemPrompt: string;
    systemPromptTooltip: string;
    useCurrentDocumentContext: string;
    useCurrentSearchResultsContext: string;
    dave: string;
    you: string;
    contextSources: string;
    relevantPassages: string;
    fullDocument: string;
    searchingDocuments: string;
    generating: string;
    thankYouRating: string;
    rateConversation: string;
    document: string;
    conversationRatedSuccessfully: string;
    errorRatingConversation: string;
    errorGeneratingResponse: string;
    showPrompt: string;
    hidePrompt: string;
  };
  document: {
    toolbar: {
      logout: string;
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
        filter: string;
        settings: string;
        clusters: string;
        data: string;
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
      addContent: {
        title: string;
        description: string;
        addType: string;
        loadTaxonomy: string;
        tooltipNotRecognized: string;
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
  search: {
    facets: {
      deAnonymize: string;
      anonymize: string;
      deAnonymizeTooltip: string;
      anonymizeTooltip: string;
    };
    documents: string;
    results: string;
    for: string;
    loadMore: string;
    filter: string;
    findFilter: string;
    clearAllFilters: string;
    searchDocuments: string;
    findFacet: string;
    showLess: string;
    showMore: string;
  };
  settings: {
    title: string;
    subtitle: string;
    language: {
      label: string;
      description: string;
      selectPlaceholder: string;
      english: string;
      italian: string;
    };
    llmConfig: {
      title: string;
      description: string;
    };
    generalSettings: {
      title: string;
      description: string;
    };
    annotationConfig: {
      title: string;
      header: string;
      buttons: {
        new: string;
        update: string;
        saveAs: string;
      };
      configSelector: {
        label: string;
        placeholder: string;
        activeSuffix: string;
        setActive: string;
        delete: string;
        activeNote: string;
      };
      description: string;
      addService: {
        title: string;
        nameLabel: string;
        namePlaceholder: string;
        uriLabel: string;
        uriPlaceholder: string;
        typeLabel: string;
        createButton: string;
        creating: string;
        note: string;
      };
      availableServices: {
        title: string;
        loading: string;
        count: string;
        edit: string;
        delete: string;
      };
      pipeline: {
        title: string;
        description: string;
        slotLabel: string;
        selectImpl: string;
        clear: string;
        chooseService: string;
        notSelected: string;
        noServices: string;
        previewLabel: string;
        noService: string;
        quickAdd: string;
        prefillButton: string;
        prefillModalTitle: string;
        prefillModalContent: string;
        createSelectButton: string;
        createSelectModalTitle: string;
        namePlaceholder: string;
        uriPlaceholder: string;
        validationWarning: string;
        successMessage: string;
      };
      preview: {
        title: string;
      };
      saveModal: {
        updateTitle: string;
        saveTitle: string;
        nameLabel: string;
        namePlaceholder: string;
        updateNote: string;
        setActiveLabel: string;
        createNoteActive: string;
        createNoteInactive: string;
      };
      messages: {
        signInRequired: string;
        nameRequired: string;
        serviceCreated: string;
        serviceDeleted: string;
        serviceUpdated: string;
        configUpdated: string;
        configSaved: string;
        configCreated: string;
        configActivated: string;
        configDeleted: string;
        configLoaded: string;
        newConfigStarted: string;
        createFailed: string;
        deleteFailed: string;
        updateFailed: string;
        saveFailed: string;
        activateFailed: string;
        loadFailed: string;
      };
    };
  };
  settingsLLM: {
    breadcrumb: string;
    title: string;
    subtitle: string;
    infoBox: {
      title: string;
      content: string;
    };
    switch: {
      label: string;
      help: string;
    };
    alertBox: {
      title: string;
      content: string;
    };
    form: {
      baseURL: {
        label: string;
        placeholder: string;
        help: string;
      };
      apiKey: {
        label: string;
        placeholder: string;
        help: string;
      };
      model: {
        label: string;
        placeholder: string;
        help: string;
      };
      enableMessageHistory: {
        label: string;
        help: string;
      };
    };
    generationDefaults: {
      title: string;
      description: string;
      systemPrompt: string;
      systemPromptHelp: string;
      temperature: string;
      temperatureHelp: string;
      maxTokens: string;
      maxTokensHelp: string;
      topP: string;
      topPHelp: string;
      topK: string;
      topKHelp: string;
      frequencyPenalty: string;
      frequencyPenaltyHelp: string;
      resetToDefaults: string;
    };
    test: {
      button: string;
      testing: string;
      success: string;
      failed: string;
      response: string;
    };
    buttons: {
      save: string;
      saving: string;
      clear: string;
      success: string;
    };
    proTip: {
      title: string;
      content: string;
    };
    messages: {
      enableCustom: string;
      fillRequired: string;
      confirmClear: string;
      saveFailed: string;
      clearFailed: string;
      testFailed: string;
    };
  };
  common: {
    loading: string;
    showNames: string;
    hideNames: string;
    toolbar: {
      browseDocs: string;
      logout: string;
      login: string;
      manageTaxonomy: string;
      manageCollections: string;
      annotationConfig: string;
      settings: string;
    };
  };
};
