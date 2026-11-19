import { loadLocale } from '@/translation';
import { GetStaticProps, GetStaticPropsContext } from 'next';

type StaticPropsResult = {
  [key: string]: any;
  props: Record<string, any>;
};

type StaticPropsWithLocale = StaticPropsResult & {
  props: {
    locale: any;
    [key: string]: string;
  };
};

const withLocale = (handler: GetStaticProps) => {
  return async (context: GetStaticPropsContext) => {
    const localeObj = await loadLocale(process.env.LOCALE);
    const res = (await handler(context)) as StaticPropsResult;

    return {
      ...res,
      props: {
        ...res.props,
        locale: localeObj,
      },
    };
  };
};

export default withLocale;
